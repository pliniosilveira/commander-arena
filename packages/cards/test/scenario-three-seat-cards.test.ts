// Real cards of the golden corpus played with three seats (issue 420, "more opponents"): each card reads its opponents (every opponent, a number of opponents, "for each opponent",
// goad, the monarch, a vote, myriad) and is checked against what it says when two opponents are in the game. The text of each card is the real Oracle text of the corpus, read through
// the grammar with no override; a card that did not behave would be listed in docs/MORE_OPPONENTS_INVESTIGATION.md as not supported for more than one opponent.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 12 }, () => 'Island');
const hand = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.hand.length ?? -1;
const count = (g: ScenarioGame, name: string, seat: number) =>
  g.find({ name, zone: 'battlefield', seat }).length;

describe('Gluttonous Troll: "a number of Food tokens equal to the number of opponents you have"', () => {
  const TROLL = real('Gluttonous Troll');
  const food = (seats: 2 | 3 | 4) => {
    const b = scenario({ seats }).define(TROLL).seat(0).hand(TROLL.name).pool('BGGGGG');
    b.library(...FILLER);
    for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(TROLL.name, { pay: true });
    g.passAll();
    return count(g, 'Food', 0);
  };
  test.each([
    [2, 1],
    [3, 2],
    [4, 3],
  ] as const)('with %i seats it makes %i Food', (seats, foods) => {
    expect(food(seats)).toBe(foods);
  });
});

describe('Voice of Many: "draw a card for each opponent who controls fewer creatures than you"', () => {
  const VOICE = real('Voice of Many');
  test('only the opponents with fewer creatures count', () => {
    const b = scenario({ seats: 3 }).define(VOICE).seat(0).hand(VOICE.name).pool('GGGGGG');
    b.battlefield(BEARS)
      .battlefield(BEARS)
      .library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2)
      .battlefield(BEARS)
      .battlefield(BEARS)
      .battlefield(BEARS)
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    const before = hand(g, 0);
    g.act(0).cast(VOICE.name, { pay: true });
    g.passAll();
    // The Voice itself makes it three creatures against seat 1's none and seat 2's three: one draw.
    expect(hand(g, 0)).toBe(before - 1 + 1);
  });
  test('both opponents with fewer creatures: two cards', () => {
    const b = scenario({ seats: 3 }).define(VOICE).seat(0).hand(VOICE.name).pool('GGGGGG');
    b.battlefield(BEARS).library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    const before = hand(g, 0);
    g.act(0).cast(VOICE.name, { pay: true });
    g.passAll();
    expect(hand(g, 0)).toBe(before - 1 + 2);
  });
});

describe('Chandra’s Ignition: "... deals damage equal to its power to each other creature and each opponent"', () => {
  const IGNITION = real("Chandra's Ignition");
  test('every opponent is dealt the damage', () => {
    const b = scenario({ seats: 3 }).define(IGNITION).seat(0).hand(IGNITION.name).pool('RRRRRR');
    b.battlefield(BEARS, { label: 'mine' }).library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(IGNITION.name, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(2, 38);
    g.expect.life(0, 40);
  });
});

const zone = (g: ScenarioGame, label: string) => g.state.objects[g.id(label)]?.zone;

describe('Grasp of Fate: "for each opponent, exile up to one target nonland permanent that player controls"', () => {
  const GRASP = real('Grasp of Fate');
  test('one target for each opponent, each of their own', () => {
    const b = scenario({ seats: 3 }).define(GRASP).seat(0).hand(GRASP.name).pool('WWWW');
    b.library(...FILLER);
    b.seat(1)
      .battlefield(BEARS, { label: 'a' })
      .library(...FILLER);
    b.seat(2)
      .battlefield(BEARS, { label: 'b' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(GRASP.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('a', 'b');
    g.passAll();
    expect(zone(g, 'a')).toBe('exile');
    expect(zone(g, 'b')).toBe('exile');
  });
});

describe('Palace Jailer: exiled "until an opponent becomes the monarch"', () => {
  const JAILER = real('Palace Jailer');
  test('either opponent becoming the monarch returns the creature (CR 725.3)', () => {
    const b = scenario({ seats: 3 }).define(JAILER).seat(0).hand(JAILER.name).pool('WWWW');
    b.library(...FILLER);
    b.seat(1).battlefield(BEARS, { label: 'a' }).battlefield(BEARS, { label: 'c' });
    b.library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(JAILER.name, { pay: true });
    g.passAll();
    g.act(0).orderTriggers(0, 1);
    g.act(0).chooseTargets('a');
    g.passAll();
    expect(zone(g, 'a')).toBe('exile');
    expect(g.state.monarch).toBe(0);
    // Seat 1 hits the monarch on its own turn and takes the crown: the creature comes back.
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 0 } }]);
    g.advanceTo('declareBlockers', { attack: false, block: false });
    g.act(0).declareBlockers([]);
    g.advanceTo('combatDamage', { block: false });
    g.passAll();
    expect(g.state.monarch).toBe(1);
    expect(zone(g, 'a')).toBe('battlefield');
  });
});

describe('Geode Rager: "goad each creature target player controls"', () => {
  const RAGER = real('Geode Rager');
  function goaded(): ScenarioGame {
    const b = scenario({ seats: 3 }).define(RAGER).seat(0).battlefield(RAGER.name).hand('Plains');
    b.library(...FILLER);
    b.seat(1)
      .battlefield(BEARS, { label: 'c' })
      .library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).playLand('Plains');
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  }
  test('the goaded creature may not attack the goading player, and must attack another (CR 701.15b)', () => {
    const g = goaded();
    expect(() => g.act(1).declareAttackers([{ attacker: 'c', target: { player: 0 } }])).toThrow();
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 2 } }]);
    expect(g.state.combat?.attackers).toHaveLength(1);
  });
});

describe('Kardur, Doomscourge: opponents’ creatures "attack a player other than you if able"', () => {
  const KARDUR = real('Kardur, Doomscourge');
  test('both opponents’ creatures must attack, and not the player who goaded them', () => {
    const b = scenario({ seats: 3 }).define(KARDUR).seat(0).hand(KARDUR.name).pool('BRRR');
    b.library(...FILLER);
    b.seat(1)
      .battlefield(BEARS, { label: 'c' })
      .library(...FILLER);
    b.seat(2)
      .battlefield(BEARS, { label: 'd' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(KARDUR.name, { pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    expect(() => g.act(1).declareAttackers([{ attacker: 'c', target: { player: 0 } }])).toThrow();
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 2 } }]);
    g.advanceTo('declareBlockers', { attack: false });
    g.act(2).declareBlockers([]);
    g.advanceTo('upkeep', { turn: 'next', block: false });
    g.advanceTo('declareAttackers', { attack: false });
    expect(() => g.act(2).declareAttackers([{ attacker: 'd', target: { player: 0 } }])).toThrow();
    g.act(2).declareAttackers([{ attacker: 'd', target: { player: 1 } }]);
  });
});

describe('Emissary Green: "starting with you, each player votes for profit or security"', () => {
  const GREEN = real('Emissary Green');
  test('three votes are cast in turn order and counted (CR 701.38)', () => {
    const b = scenario({ seats: 3 }).define(GREEN).seat(0).battlefield(GREEN.name, { label: 'g' });
    b.library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'g', target: { player: 1 } }]);
    g.passAll();
    g.act(0).chooseOption('profit');
    g.act(1).chooseOption('security');
    g.act(2).chooseOption('profit');
    g.passAll();
    // Two profit votes: four Treasures; one security vote: one +1/+1 counter on each creature.
    expect(count(g, 'Treasure', 0)).toBe(4);
    g.expect.counters('g', { '+1/+1': 1 });
  });
});

describe('Goldlust Triad: myriad with the real text', () => {
  const TRIAD = real('Goldlust Triad');
  test('a token copy attacks the opponent that was not attacked, and is exiled at end of combat', () => {
    const b = scenario({ seats: 3 }).define(TRIAD).seat(0).battlefield(TRIAD.name, { label: 't' });
    b.library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 't', target: { player: 1 } }]);
    g.passAll();
    g.act(0).accept();
    expect(g.find({ name: TRIAD.name, zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.advanceTo('combatDamage', { block: false });
    // Each copy's "deals combat damage to a player" trigger is waiting to be ordered.
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.life(1, 36);
    g.expect.life(2, 36);
    g.advanceTo('postcombatMain', { block: false });
    expect(g.find({ name: TRIAD.name, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    expect(count(g, 'Treasure', 0)).toBe(2);
  });
});

describe('Legion Loyalty: "creatures you control have myriad"', () => {
  const LOYALTY = real('Legion Loyalty');
  test('a plain creature attacking one opponent makes a token for the other', () => {
    const b = scenario({ seats: 3 }).define(LOYALTY).seat(0).battlefield(LOYALTY.name);
    b.battlefield(BEARS, { label: 'm' }).library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'm', target: { player: 1 } }]);
    g.passAll();
    g.act(0).accept();
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.advanceTo('postcombatMain', { block: false });
    g.expect.life(1, 38);
    g.expect.life(2, 38);
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(1);
  });
});

describe('Breena, the Demagogue: "if that opponent has more life than another of your opponents"', () => {
  const BREENA = real('Breena, the Demagogue');
  function attacked(target: 1 | 2, life1: number, life2: number): ScenarioGame {
    const b = scenario({ seats: 3 })
      .define(BREENA)
      .seat(0)
      .battlefield(BREENA.name, { label: 'br' });
    b.library(...FILLER);
    b.seat(1)
      .battlefield(BEARS, { label: 'c' })
      .library(...FILLER)
      .life(life1);
    b.seat(2)
      .library(...FILLER)
      .life(life2);
    const g = b.at('precombatMain', { active: 1, turn: 4 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: target } }]);
    return g;
  }
  test('the attacked opponent has more life than the other opponent: the attacker draws and Breena grows', () => {
    // Seat 1 attacks seat 2, who has more life than seat 0’s other opponent (seat 1).
    const g = attacked(2, 30, 40);
    const before = hand(g, 1);
    g.passAll();
    expect(hand(g, 1)).toBe(before + 1);
    // Breena’s controller (seat 0, not the attacker) chooses the creature that gets the counters.
    g.act(0).choosePermanents('br');
    g.expect.counters('br', { '+1/+1': 2 });
  });
  test('the attacked opponent has less life: nothing happens', () => {
    const g = attacked(2, 40, 30);
    const before = hand(g, 1);
    g.passAll();
    expect(hand(g, 1)).toBe(before);
    g.expect.counters('br', {});
  });
});

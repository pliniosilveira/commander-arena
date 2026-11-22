// Real cards of the golden corpus played with three seats (issue 420, "more opponents"): each card reads its opponents (every opponent, a number of opponents, "for each opponent",
// goad, the monarch, a vote, myriad) and is checked against what it says when two opponents are in the game. The text of each card is the real Oracle text of the corpus, read through
// the grammar with no override; a card that did not behave would be listed in docs/MORE_OPPONENTS_INVESTIGATION.md as not supported for more than one opponent.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

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

describe('Syphon Mind: "each other player discards a card. You draw a card for each card discarded this way"', () => {
  const SYPHON = real('Syphon Mind');
  test('every other player discards, and the caster draws one card for each', () => {
    const b = scenario({ seats: 3 }).define(SYPHON).seat(0).hand(SYPHON.name).pool('BBBB');
    b.library(...FILLER);
    b.seat(1)
      .hand(BEARS, { label: 'a' })
      .library(...FILLER);
    b.seat(2)
      .hand(BEARS, { label: 'b' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    const before = hand(g, 0);
    g.act(0).cast(SYPHON.name, { pay: true });
    g.passAll();
    expect(zone(g, 'a')).toBe('graveyard');
    expect(zone(g, 'b')).toBe('graveyard');
    expect(hand(g, 0)).toBe(before - 1 + 2);
  });
});

describe('Fateful Tempest: "starting with you, each player votes for past or present"', () => {
  const TEMPEST = real('Fateful Tempest');
  test('three votes, damage to each opponent from the cards milled, and the top card exiled for the present vote', () => {
    const b = scenario({ seats: 3 }).define(TEMPEST).seat(0).hand(TEMPEST.name).pool('RRR');
    b.library(BEARS, BEARS, BEARS, ...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(TEMPEST.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('past');
    g.act(1).chooseOption('present');
    g.act(2).chooseOption('past');
    g.passAll();
    // Two "past" votes mill two Grizzly Bears (mana value 2 each): 4 damage to each opponent.
    g.expect.life(1, 36);
    g.expect.life(2, 36);
    g.expect.life(0, 40);
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 0 })).toHaveLength(2);
    expect(g.find({ name: BEARS, zone: 'exile', seat: 0 })).toHaveLength(1);
  });
});

describe('Nazgûl: "the Ring tempts you" with three seats', () => {
  const NAZGUL = real('Nazgûl');
  test('the Ring tempts the controller: a Ring-bearer is chosen and the Wraith grows', () => {
    const b = scenario({ seats: 3 }).define(NAZGUL).seat(0).hand(NAZGUL.name).pool('BBB');
    b.library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(NAZGUL.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.counters(NAZGUL.name, { '+1/+1': 1 });
  });
});

describe('Archon of Cruelty: "target opponent sacrifices a creature or planeswalker, discards a card, and loses 3 life"', () => {
  const ARCHON = real('Archon of Cruelty');
  test('only the targeted opponent is affected; the other is not', () => {
    const b = scenario({ seats: 3 }).define(ARCHON).seat(0).hand(ARCHON.name).pool('BBBBBBBB');
    b.library(...FILLER);
    b.seat(1)
      .battlefield(BEARS, { label: 'one' })
      .hand(BEARS, { label: 'h1' })
      .library(...FILLER);
    b.seat(2)
      .battlefield(BEARS, { label: 'two' })
      .hand(BEARS, { label: 'h2' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(ARCHON.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 2 });
    g.passAll();
    g.passAll();
    expect(zone(g, 'two')).toBe('graveyard');
    expect(zone(g, 'h2')).toBe('graveyard');
    g.expect.life(2, 37);
    expect(zone(g, 'one')).toBe('battlefield');
    expect(zone(g, 'h1')).toBe('hand');
    g.expect.life(1, 40);
  });
});

describe('Rot Hulk: "up to X target Zombie cards ..., where X is the number of opponents you have"', () => {
  const HULK = real('Rot Hulk');
  const ZOMBIE = parsed('SYNTHETIC Test Zombie', 'Creature — Zombie', '', {
    manaCost: '{B}',
    power: '1',
    toughness: '1',
    colors: ['B'],
  });
  test('with two opponents X is 2: at most two of the three Zombie cards return', () => {
    const b = scenario({ seats: 3 })
      .define(HULK)
      .define(ZOMBIE)
      .seat(0)
      .hand(HULK.name)
      .pool('BBBBBBB');
    b.graveyard(ZOMBIE.name, { label: 'z1' })
      .graveyard(ZOMBIE.name, { label: 'z2' })
      .graveyard(ZOMBIE.name, { label: 'z3' })
      .library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(HULK.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('z1', 'z2');
    g.passAll();
    expect(zone(g, 'z1')).toBe('battlefield');
    expect(zone(g, 'z2')).toBe('battlefield');
    expect(zone(g, 'z3')).toBe('graveyard');
  });
});

describe('Scourge of the Throne: dethrone reads "the player with the most life or tied for most life"', () => {
  const SCOURGE = real('Scourge of the Throne');
  function attack(target: 1 | 2): ScenarioGame {
    const b = scenario({ seats: 3 })
      .define(SCOURGE)
      .seat(0)
      .battlefield(SCOURGE.name, { label: 's' });
    b.library(...FILLER);
    b.seat(1)
      .library(...FILLER)
      .life(40);
    b.seat(2)
      .library(...FILLER)
      .life(30);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 's', target: { player: target } }]);
    // Dethrone and the first-attack trigger both trigger for the attack of seat 0 on the opponent with the most life.
    if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
    g.passAll();
    return g;
  }
  test('attacking the opponent with the most life: a +1/+1 counter', () => {
    const g = attack(1);
    g.expect.counters('s', { '+1/+1': 1 });
  });
  test('attacking the opponent with less life than another: nothing', () => {
    const g = attack(2);
    g.expect.counters('s', {});
  });
});

describe('Dismantling Wave: "for each opponent, destroy up to one target artifact or enchantment that player controls"', () => {
  const WAVE = real('Dismantling Wave');
  test('one artifact or enchantment of each opponent can be destroyed', () => {
    const b = scenario({ seats: 3 }).define(WAVE).seat(0).hand(WAVE.name).pool('WWW');
    b.library(...FILLER);
    b.seat(1)
      .battlefield('Sol Ring', { label: 'ring' })
      .library(...FILLER);
    b.seat(2)
      .battlefield('Sol Ring', { label: 'ring2' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(WAVE.name, { targets: ['ring', 'ring2'], pay: true });
    g.passAll();
    expect(zone(g, 'ring')).toBe('graveyard');
    expect(zone(g, 'ring2')).toBe('graveyard');
  });
});

describe('Coveted Jewel: "whenever one or more creatures an opponent controls attack you and aren’t blocked"', () => {
  const JEWEL = real('Coveted Jewel');
  test('an opponent attacking its controller unblocked draws three cards and takes the Jewel', () => {
    const b = scenario({ seats: 3 }).define(JEWEL).seat(0).battlefield(JEWEL.name, { label: 'j' });
    b.library(...FILLER);
    b.seat(1)
      .battlefield(BEARS, { label: 'c' })
      .library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 1, turn: 4 }).build();
    const before = hand(g, 1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 0 } }]);
    g.advanceTo('declareBlockers', { attack: false, block: false });
    g.advanceTo('combatDamage', { block: false });
    g.passAll();
    expect(hand(g, 1)).toBe(before + 3);
    // Control is a layer 2 effect, so it is read as the engine reads it: through the query's seat.
    expect(count(g, JEWEL.name, 1)).toBe(1);
    expect(count(g, JEWEL.name, 0)).toBe(0);
  });
});

describe('Impulsive Pilferer: encore "for each opponent, create a token copy that attacks that opponent this turn if able"', () => {
  const PILFERER = real('Impulsive Pilferer');
  test('one token for each opponent, each required to attack its own opponent', () => {
    const b = scenario({ seats: 3 }).define(PILFERER).seat(0).graveyard(PILFERER.name);
    b.battlefield('Mountain', { count: 4 });
    b.library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).activate(PILFERER.name, { pay: true });
    g.passAll();
    expect(count(g, PILFERER.name, 0)).toBe(2);
    g.advanceTo('declareAttackers', { attack: false });
    const tokens = g.find({ name: PILFERER.name, zone: 'battlefield', seat: 0 }).map((o) => o.id);
    const [first, second] = tokens;
    // Both at the same opponent is not allowed: each must attack the one it was made for.
    expect(() =>
      g.act(0).declareAttackers(tokens.map((attacker) => ({ attacker, target: { player: 1 } }))),
    ).toThrow();
    g.act(0).declareAttackers([
      { attacker: first as string, target: { player: 1 } },
      { attacker: second as string, target: { player: 2 } },
    ]);
  });
});

describe('Port Razer: "can’t attack a player it has already attacked this turn"', () => {
  const RAZER = real('Port Razer');
  test('in the extra combat it may attack the other opponent, and not the one it already attacked', () => {
    const b = scenario({ seats: 3 }).define(RAZER).seat(0).battlefield(RAZER.name, { label: 'r' });
    b.library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'r', target: { player: 1 } }]);
    g.advanceTo('declareBlockers', { attack: false, block: false });
    g.advanceTo('combatDamage', { block: false });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    expect(() => g.act(0).declareAttackers([{ attacker: 'r', target: { player: 1 } }])).toThrow();
    g.act(0).declareAttackers([{ attacker: 'r', target: { player: 2 } }]);
  });
});

describe('Combustible Gearhulk: "target opponent may have you draw three cards"', () => {
  const GEARHULK = real('Combustible Gearhulk');
  test('the opponent that is targeted is the one asked', () => {
    const b = scenario({ seats: 3 }).define(GEARHULK).seat(0).hand(GEARHULK.name).pool('RRRRRR');
    b.library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(GEARHULK.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 2 });
    g.passAll();
    g.expect.pending('confirmOptional', 2);
  });
});

describe('Parapet Thrasher: "choose one that hasn’t been chosen this turn ... 4 damage to each other opponent"', () => {
  const THRASHER = real('Parapet Thrasher');
  test('the mode damages the opponent that was not hit by the Dragon', () => {
    const b = scenario({ seats: 3 })
      .define(THRASHER)
      .seat(0)
      .battlefield(THRASHER.name, { label: 't' });
    b.library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 't', target: { player: 1 } }]);
    g.advanceTo('combatDamage', { block: false });
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(1);
    g.passAll();
    // Seat 1 took the Dragon's 4 combat damage; "each other opponent" is seat 2, who takes 4.
    g.expect.life(1, 36);
    g.expect.life(2, 36);
    g.expect.life(0, 40);
  });
});

describe('Angel of Destiny: "each player this creature attacked this turn loses the game"', () => {
  const ANGEL = real('Angel of Destiny');
  test('only the player the Angel attacked loses, not the one another creature attacked', () => {
    const b = scenario({ seats: 3 }).define(ANGEL).seat(0).life(55);
    b.battlefield(ANGEL.name, { label: 'angel' }).battlefield(BEARS, { label: 'bears' });
    b.library(...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'angel', target: { player: 1 } },
      { attacker: 'bears', target: { player: 2 } },
    ]);
    // Each damage step has triggers of the Angel to order; the end step trigger needs 15 life more than the starting 40.
    for (let i = 0; i < 12; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') {
        g.act(0).orderTriggers(...d.triggers.map((_, index) => index));
      } else if (g.state.seats[1]?.hasLost === true) {
        break;
      } else {
        g.passAll();
      }
    }
    expect(g.state.seats[1]?.hasLost).toBe(true);
    expect(g.state.seats[2]?.hasLost).toBe(false);
  });
});

describe('Selvala’s Stampede: "each player votes for wild or free"', () => {
  const STAMPEDE = real("Selvala's Stampede");
  test('two wild votes put two creatures onto the battlefield, one free vote may put a permanent from the hand', () => {
    const b = scenario({ seats: 3 }).define(STAMPEDE).seat(0).hand(STAMPEDE.name).pool('GGGGGG');
    b.hand('Sol Ring', { label: 'ring' });
    b.library('Island', BEARS, 'Island', 'Giant Spider', ...FILLER);
    b.seat(1).library(...FILLER);
    b.seat(2).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(STAMPEDE.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('wild');
    g.act(1).chooseOption('free');
    g.act(2).chooseOption('wild');
    g.passAll();
    expect(count(g, BEARS, 0)).toBe(1);
    expect(count(g, 'Giant Spider', 0)).toBe(1);
    // One "free" vote: the controller may put the Sol Ring from hand onto the battlefield.
    const d = g.state.pending;
    if (d !== null && d.kind === 'confirmOptional') g.act(0).accept();
    if (g.state.pending?.kind === 'chooseCards') g.act(0).chooseCards('ring');
    expect(zone(g, 'ring')).toBe('battlefield');
  });
});

describe('Witch-king of Angmar: "each opponent sacrifices a creature of their choice that dealt combat damage to you"', () => {
  const KING = real('Witch-king of Angmar');
  test('the attacking opponent sacrifices one of the creatures that hit, the other opponent is not asked', () => {
    const b = scenario({ seats: 3 }).define(KING).seat(0).battlefield(KING.name);
    b.library(...FILLER);
    b.seat(1)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(BEARS, { label: 'b' })
      .library(...FILLER);
    b.seat(2)
      .battlefield('Giant Spider', { label: 'spider' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 1, turn: 4 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: 'a', target: { player: 0 } },
      { attacker: 'b', target: { player: 0 } },
    ]);
    g.advanceTo('declareBlockers', { attack: false, block: false });
    g.act(0).declareBlockers([]);
    g.advanceTo('combatDamage', { block: false });
    g.passAll();
    // Seat 1 chooses which of the two that dealt damage goes; seat 2 had none that dealt damage and is not touched.
    g.act(1).choosePermanents('a');
    g.passAll();
    expect(zone(g, 'a')).toBe('graveyard');
    expect(zone(g, 'b')).toBe('battlefield');
    expect(zone(g, 'spider')).toBe('battlefield');
  });
});

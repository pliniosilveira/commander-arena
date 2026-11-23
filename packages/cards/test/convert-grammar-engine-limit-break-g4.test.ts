// The Limit Break deck (issue 96), group 4: the REAL Oracle text of Vincent, Vengeful Atoner, Tifa, Martial Artist, Heidegger, Shinra Executive, Hellkite Tyrant, Avalanche of Sector 7 and
// Professor Hojo (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so
// the nodes the parser writes for the real text are what the engine runs. The opponents' permanents are SYNTHETIC vanilla cards (an artifact, a creature with a power of 7, a Soldier).
// Every test about an opponent runs with three or four seats.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');

const RING = parsed('SYNTHETIC Trinket', 'Artifact', '', { manaCost: '{1}' });
const BEHEMOTH = parsed('SYNTHETIC Behemoth', 'Creature — Beast', '', {
  manaCost: '{7}',
  power: '7',
  toughness: '7',
});
const SOLDIER = parsed('SYNTHETIC Soldier', 'Creature — Human Soldier', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const LIFE_GADGET = parsed('SYNTHETIC Life Gadget', 'Artifact', '{T}: You gain 1 life.', {
  manaCost: '{1}',
});
const LIFE_CREATURE = parsed(
  'SYNTHETIC Life Creature',
  'Creature — Human',
  '{T}: You gain 1 life.',
  {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
  },
);
const ANY_PUMP_GADGET = parsed(
  'SYNTHETIC Any Pump Gadget',
  'Artifact',
  '{3}, {T}: Target creature gets +1/+1 until end of turn.',
  { manaCost: '{1}' },
);
const PUMP_GADGET = parsed(
  'SYNTHETIC Pump Gadget',
  'Artifact',
  '{3}, {T}: Target creature you control gets +1/+1 until end of turn.',
  { manaCost: '{1}' },
);

const VINCENT = real('Vincent, Vengeful Atoner');
const TIFA = real('Tifa, Martial Artist');
const HEIDEGGER = real('Heidegger, Shinra Executive');
const HELLKITE = real('Hellkite Tyrant');
const AVALANCHE = real('Avalanche of Sector 7');
const HOJO = real('Professor Hojo');

const life = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.life ?? -1;
const view = (g: ScenarioGame, label: string) =>
  g.view(0).battlefield.find((o) => o.id === g.id(label));

/** Seat `seat` attacks the listed players with the listed creatures, nobody blocks, and the game stops after combat damage. */
function attack(
  g: ScenarioGame,
  seat: number,
  declared: readonly (readonly [label: string, defender: number])[],
  /** The order of two triggers of the combat damage that a player is asked about (CR 603.3b): the first is put on the stack first. */
  order: readonly [number, number] = [0, 1],
): void {
  g.advanceTo('declareAttackers', { attack: false });
  g.act(seat).declareAttackers(
    declared.map(([attacker, player]) => ({ attacker, target: { player } })),
  );
  g.advanceTo('declareBlockers');
  while (g.state.pending?.kind === 'declareBlockers') g.act(g.deciding).declareBlockers([]);
  g.advanceTo('combatDamage');
  g.passAll();
  if (g.state.pending?.kind === 'orderTriggers') g.act(g.deciding).orderTriggers(...order);
}

function table(seats: 2 | 3 | 4) {
  const b = scenario({ seats });
  for (const card of [
    VINCENT,
    TIFA,
    HEIDEGGER,
    HELLKITE,
    AVALANCHE,
    HOJO,
    RING,
    BEHEMOTH,
    SOLDIER,
    LIFE_GADGET,
    LIFE_CREATURE,
    PUMP_GADGET,
    ANY_PUMP_GADGET,
  ]) {
    b.define(card);
  }
  for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  return b;
}

describe('Hellkite Tyrant: "gain control of all artifacts that player controls" (CR 613.1b, 611.2a)', () => {
  test('is valid', () => {
    expect(HELLKITE.faces[0]?.abilities.length).toBeGreaterThan(0);
  });

  test('3 seats: it takes the artifacts of the player it damaged and no others', () => {
    const b = table(3);
    b.seat(0).battlefield(HELLKITE.name);
    b.seat(1).battlefield(RING.name, { label: 'a1' }).battlefield(RING.name, { label: 'a2' });
    b.seat(2).battlefield(RING.name, { label: 'b1' });
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    attack(g, 0, [[HELLKITE.name, 1]]);
    // The trigger is on the stack above the combat damage step.
    g.passAll();
    expect(view(g, 'a1')?.controller).toBe(0);
    expect(view(g, 'a2')?.controller).toBe(0);
    expect(view(g, 'b1')?.controller).toBe(2);
  });

  test('4 seats: the player it damages is the one it takes from, whichever seat it is', () => {
    const b = table(4);
    b.seat(0).battlefield(HELLKITE.name);
    b.seat(1).battlefield(RING.name, { label: 'a1' });
    b.seat(3).battlefield(RING.name, { label: 'd1' });
    const g = b.at('precombatMain', { active: 0, turn: 5 }).build();
    attack(g, 0, [[HELLKITE.name, 3]]);
    g.passAll();
    expect(view(g, 'd1')?.controller).toBe(0);
    expect(view(g, 'a1')?.controller).toBe(1);
  });

  test('a permanent that is not an artifact is not taken', () => {
    const b = table(3);
    b.seat(0).battlefield(HELLKITE.name);
    b.seat(1).battlefield(RING.name, { label: 'a1' }).battlefield(BEARS, { label: 'bears' });
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    attack(g, 0, [[HELLKITE.name, 1]]);
    g.passAll();
    expect(view(g, 'a1')?.controller).toBe(0);
    expect(view(g, 'bears')?.controller).toBe(1);
  });

  test('At the beginning of your upkeep, with twenty artifacts you win; with nineteen you do not', () => {
    for (const [count, wins] of [
      [20, true],
      [19, false],
    ] as const) {
      const b = table(3);
      b.seat(0).battlefield(HELLKITE.name).battlefield(RING.name, { count });
      const g = b.at('end', { active: 2, turn: 2 }).build();
      g.advanceTo('upkeep', { turn: 'next' });
      g.passAll();
      if (wins) g.expect.gameOver({ win: 0 });
      else expect(g.state.result).toBeNull();
    }
  });
});

describe('Vincent, Vengeful Atoner: "Chaos" (CR 120.2, 608.2c)', () => {
  const setup = (seats: 2 | 3 | 4, counters: number) => {
    const b = table(seats);
    b.seat(0).battlefield(VINCENT.name, { counters: { '+1/+1': counters } });
    return b.at('precombatMain', { active: 0, turn: seats + 1 }).build();
  };

  test('3 seats: power 7 or greater: the other opponent is dealt as much damage as the one hit', () => {
    const g = setup(3, 4);
    attack(g, 0, [[VINCENT.name, 1]]);
    g.passAll();
    expect([life(g, 1), life(g, 2)]).toEqual([33, 33]);
  });

  test('4 seats: both of the other opponents are dealt it, the controller is not', () => {
    const g = setup(4, 4);
    attack(g, 0, [[VINCENT.name, 2]]);
    g.passAll();
    expect([life(g, 0), life(g, 1), life(g, 2), life(g, 3)]).toEqual([40, 33, 33, 33]);
  });

  test('3 seats: with a power under 7 nothing else happens', () => {
    const g = setup(3, 2);
    attack(g, 0, [[VINCENT.name, 1]]);
    g.passAll();
    expect([life(g, 1), life(g, 2)]).toEqual([35, 40]);
  });

  test('the power is read as the ability resolves: the counter first makes 6 into 7, the other order does not', () => {
    // Vincent has a power of 6 as it deals the damage, and two triggers to order: the one put on the stack last resolves first (CR 603.3b). The decision lists the triggers in the
    // order of the card: the counter trigger is entry 1 and Chaos entry 0.
    const counterLast = setup(3, 3);
    attack(counterLast, 0, [[VINCENT.name, 1]], [1, 0]);
    counterLast.passAll();
    expect([life(counterLast, 1), life(counterLast, 2)]).toEqual([34, 40]);
    const counterFirst = setup(3, 3);
    attack(counterFirst, 0, [[VINCENT.name, 1]], [0, 1]);
    counterFirst.passAll();
    expect([life(counterFirst, 1), life(counterFirst, 2)]).toEqual([34, 34]);
  });

  test('2 seats: there is no other opponent', () => {
    const g = setup(2, 4);
    attack(g, 0, [[VINCENT.name, 1]]);
    g.passAll();
    expect(life(g, 1)).toBe(33);
  });

  test('it puts a +1/+1 counter on itself when a creature you control deals combat damage to a player', () => {
    const b = table(3);
    b.seat(0).battlefield(VINCENT.name).battlefield(BEARS, { label: 'bears' });
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    attack(g, 0, [['bears', 2]]);
    g.passAll();
    g.expect.counters(VINCENT.name, { '+1/+1': 1 });
  });
});

describe('Tifa, Martial Artist: Melee and the extra combat (CR 508.1, 506.1, 500.8)', () => {
  test('3 seats: Melee counts each opponent attacked this combat, however many creatures attack them', () => {
    const b = table(3);
    b.seat(0)
      .battlefield(TIFA.name)
      .battlefield(BEARS, { label: 'b1' })
      .battlefield(BEARS, { label: 'b2' });
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: TIFA.name, target: { player: 1 } },
      { attacker: 'b1', target: { player: 1 } },
      { attacker: 'b2', target: { player: 2 } },
    ]);
    g.passAll();
    g.expect.pt(TIFA.name, 6, 6);
  });

  test('3 seats: attacking one opponent gives +1/+1', () => {
    const b = table(3);
    b.seat(0).battlefield(TIFA.name);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: TIFA.name, target: { player: 2 } }]);
    g.passAll();
    g.expect.pt(TIFA.name, 5, 5);
  });

  test('4 seats: three opponents attacked: +3/+3', () => {
    const b = table(4);
    b.seat(0)
      .battlefield(TIFA.name)
      .battlefield(BEARS, { label: 'b1' })
      .battlefield(BEARS, { label: 'b2' });
    const g = b.at('precombatMain', { active: 0, turn: 5 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: TIFA.name, target: { player: 1 } },
      { attacker: 'b1', target: { player: 2 } },
      { attacker: 'b2', target: { player: 3 } },
    ]);
    g.passAll();
    g.expect.pt(TIFA.name, 7, 7);
  });

  test('a creature with power 7 dealing combat damage untaps your creatures and adds a combat phase, once', () => {
    const b = table(3);
    b.seat(0).battlefield(TIFA.name).battlefield(BEHEMOTH.name);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    attack(g, 0, [[BEHEMOTH.name, 1]]);
    // The trigger resolves: every creature is untapped and an additional combat phase is waiting.
    g.passAll();
    g.expect.tapped(BEHEMOTH.name, false);
    expect(g.state.turn.addedPhases?.length).toBe(1);
    // The additional combat phase: the Behemoth attacks again; this one is not the first, so no third combat phase follows.
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.state.turn.phase).toBe('combat');
    g.act(0).declareAttackers([{ attacker: BEHEMOTH.name, target: { player: 2 } }]);
    g.advanceTo('declareBlockers');
    while (g.state.pending?.kind === 'declareBlockers') g.act(g.deciding).declareBlockers([]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.tapped(BEHEMOTH.name, false);
    expect(g.state.turn.addedPhases?.length ?? 0).toBe(0);
    expect(life(g, 1)).toBe(33);
    expect(life(g, 2)).toBe(33);
  });

  test('creatures with a power under 7 do not trigger it', () => {
    const b = table(3);
    b.seat(0).battlefield(TIFA.name).battlefield(BEARS, { label: 'bears' });
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    attack(g, 0, [['bears', 1]]);
    g.passAll();
    g.expect.tapped('bears', true);
    expect(g.state.turn.addedPhases?.length ?? 0).toBe(0);
  });
});

describe('Heidegger, Shinra Executive: opponents who control more creatures than you (CR 102.2)', () => {
  test('4 seats: one Soldier token for each opponent with more creatures, none for one with as many or fewer', () => {
    const b = table(4);
    b.seat(0).battlefield(HEIDEGGER.name).battlefield(BEARS);
    // Seat 1 has three creatures and seat 3 has five: more than the two of seat 0. Seat 2 has two: as many.
    b.seat(1).battlefield(BEARS, { count: 3 });
    b.seat(2).battlefield(BEARS, { count: 2 });
    b.seat(3).battlefield(BEARS, { count: 5 });
    const g = b.at('postcombatMain', { active: 0, turn: 5 }).build();
    g.advanceTo('end');
    g.passAll();
    expect(g.find({ name: 'Soldier', zone: 'battlefield' }).length).toBe(2);
  });

  test('3 seats: no opponent has more creatures: no token', () => {
    const b = table(3);
    b.seat(0).battlefield(HEIDEGGER.name).battlefield(BEARS, { count: 2 });
    b.seat(1).battlefield(BEARS, { count: 3 });
    b.seat(2).battlefield(BEARS, { count: 1 });
    const g = b.at('postcombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('end');
    g.passAll();
    // Seat 1 has three creatures and seat 0 three (Heidegger and two Bears): as many, not more.
    expect(g.find({ name: 'Soldier', zone: 'battlefield' }).length).toBe(0);
  });

  test('At the beginning of combat on your turn, a target creature you control gets +X/+0, X the Soldiers you control', () => {
    const b = table(3);
    b.seat(0)
      .battlefield(HEIDEGGER.name)
      .battlefield(SOLDIER.name)
      .battlefield(BEARS, { label: 'bears' });
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('beginningOfCombat', { attack: false });
    g.act(0).chooseTargets('bears');
    g.passAll();
    // Heidegger is a Human Soldier and so is the other one: X is 2.
    g.expect.pt('bears', 4, 2);
  });
});

describe('Avalanche of Sector 7: power and the damage trigger (CR 604.3, 613.4a, 602.2)', () => {
  test("4 seats: its power is the number of artifacts its controller's opponents control", () => {
    const b = table(4);
    b.seat(0).battlefield(AVALANCHE.name).battlefield(RING.name);
    b.seat(1).battlefield(RING.name, { count: 2 });
    b.seat(3).battlefield(RING.name);
    const g = b.at('precombatMain', { active: 0, turn: 5 }).build();
    g.expect.pt(AVALANCHE.name, 3, 3);
  });

  test('an artifact an opponent owns but its controller does not is not counted, and one it controls but does not own is', () => {
    const b = table(3);
    b.seat(0).battlefield(AVALANCHE.name);
    b.seat(1).battlefield(RING.name, { controller: 0 });
    b.seat(2).battlefield(RING.name);
    b.seat(0).battlefield(RING.name, { controller: 1 });
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.expect.pt(AVALANCHE.name, 2, 3);
  });

  test('3 seats: an opponent who activates an ability of an artifact they control is dealt 1 damage, another opponent is not', () => {
    const b = table(3);
    b.seat(0).battlefield(AVALANCHE.name);
    b.seat(1).battlefield(LIFE_GADGET.name);
    const g = b.at('precombatMain', { active: 1, turn: 2 }).build();
    g.act(1).activate(LIFE_GADGET.name, { ability: 0 });
    g.passAll();
    expect([life(g, 0), life(g, 1), life(g, 2)]).toEqual([40, 40, 40]);
    // The gadget gained 1 life and the trigger dealt 1 damage: 40 + 1 - 1.
  });

  test('a mana ability does not trigger it, and neither does an ability of a permanent that is not an artifact', () => {
    const b = table(3);
    b.seat(0).battlefield(AVALANCHE.name);
    b.seat(1).battlefield('Sol Ring').battlefield(LIFE_CREATURE.name);
    const g = b.at('precombatMain', { active: 1, turn: 2 }).build();
    g.act(1).tapForMana('Sol Ring');
    g.act(1).activate(LIFE_CREATURE.name, { ability: 0 });
    g.passAll();
    expect(life(g, 1)).toBe(41);
  });

  test('the controller of Avalanche activating an ability of their own artifact is not dealt damage', () => {
    const b = table(3);
    b.seat(0).battlefield(AVALANCHE.name).battlefield(LIFE_GADGET.name);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).activate(LIFE_GADGET.name, { ability: 0 });
    g.passAll();
    expect(life(g, 0)).toBe(41);
  });
});

describe('Professor Hojo: the first activated ability that targets your creature (CR 601.2f, 602.2b, 603.2)', () => {
  const board = (seats: 2 | 3 | 4, active: number, lands: number) => {
    const b = table(seats);
    b.seat(0)
      .battlefield(HOJO.name)
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(PUMP_GADGET.name, { label: 'g1' })
      .battlefield(PUMP_GADGET.name, { label: 'g2' })
      .battlefield(ANY_PUMP_GADGET.name, { label: 'any' })
      .battlefield('Island', { count: lands });
    b.seat(1).battlefield(BEARS, { label: 'theirs' });
    return b.at('precombatMain', { active, turn: seats + 1 }).build();
  };

  test('the first such activation of your turn costs {2} less, the second costs the full {3}', () => {
    const g = board(3, 0, 4);
    g.act(0).activate('g1', { ability: 0, targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pt('mine', 3, 3);
    // Four Islands: {1} paid the first activation, three are left for the second, which costs {3}.
    g.act(0).activate('g2', { ability: 0, targets: ['mine'], pay: true });
    g.passAll();
    g.expect.pt('mine', 4, 4);
    for (const land of g.find({ name: 'Island', zone: 'battlefield' })) {
      expect(land.tapped).toBe(true);
    }
  });

  test('the second activation cannot be paid with only the mana the first one needed', () => {
    const g = board(3, 0, 1);
    g.act(0).activate('g1', { ability: 0, targets: ['mine'], pay: true });
    g.passAll();
    expect(g.act(0).try.activate('g2', { ability: 0 })).toMatchObject({ ok: false });
  });

  test('an ability that targets a creature an opponent controls is not cheaper, and one that targets yours is', () => {
    const g = board(3, 0, 1);
    // Only the targets that make the cost payable are offered: with one Island that is the creature of the controller of Hojo.
    g.act(0).activate('any', { ability: 0 });
    expect(() => g.act(0).chooseTargets('theirs')).toThrow();
    g.act(0).chooseTargets('mine').payAuto();
    g.passAll();
    g.expect.pt('mine', 3, 3);
  });

  test('on the turn of another player it is not cheaper', () => {
    const g = board(3, 1, 1);
    g.act(1).pass();
    expect(g.state.turn.activeSeat).toBe(1);
    g.expect.illegal(0, { activate: 'g1', ability: 0 });
  });

  test('on your own turn the ability that targets your creature may be activated with the one mana', () => {
    const g = board(3, 0, 1);
    g.expect.legal(0, { activate: 'g1', ability: 0 });
  });

  test('one or more creatures you control become the target of an activated ability: draw a card, once each turn', () => {
    const g = board(4, 0, 6);
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).activate('g1', { ability: 0, targets: ['mine'], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(before + 1);
    g.act(0).activate('g2', { ability: 0, targets: ['mine'], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(before + 1);
  });
});

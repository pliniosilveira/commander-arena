// "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow
// counter on it." (the SYNTHETIC Vow Rite of src/cards/fixtures/synthetic-vow.ts). Pins: CR 608.2d (each player chooses as the effect resolves, among their own creatures), CR 101.4
// (the choices in turn order, the active player first), CR 701.21a (sacrifice), CR 122.1 (a counter), CR 611.2b (a duration "for as long as" that ends does not start again), CR 611.2c (the
// creatures "those creatures" are set as the effect resolves), CR 508.1a, 506.3 (what a creature can attack). Rulings (Scryfall, WotC 2021): every player must put the counter if able; if the
// counter is removed the creature attacks as usual; a counter moved or put on another creature restricts nothing.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Vow Rite';
const BREAKER = 'SYNTHETIC Vow Breaker';
const GIVER = 'SYNTHETIC Vow Giver';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const GOBLIN = 'Raging Goblin';
const ANGEL = 'Serra Angel';
const WALKER = 'SYNTHETIC Culling Walker'; // a planeswalker
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([RITE, BREAKER, GIVER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 holds the Rite and five Plains with the Bears and the Spider; seat 1 has the Goblin and the Angel. Seat 0 is active. */
const game = (extra: (b: ReturnType<typeof scenario>) => unknown = () => {}) => {
  const b = scenario()
    .seat(0)
    .hand(RITE, BREAKER, GIVER)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .battlefield(BEARS, SPIDER)
    .library(...LIBRARY)
    .seat(1)
    .battlefield(GOBLIN, ANGEL, 'Island')
    .library(...LIBRARY);
  extra(b);
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
};

const decision = (g: ScenarioGame) => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
  return d;
};

/** Casts the Rite; seat 0 keeps `mine`, seat 1 keeps `theirs`. */
const resolve = (g: ScenarioGame, mine: string, theirs: string) => {
  g.act(0).cast(RITE, { pay: true });
  g.passAll();
  expect(decision(g).spare).toEqual({
    player: 0,
    type: 'creature',
    own: true,
    onlyTypes: true,
    counter: 'vow',
  });
  g.act(0).choosePermanents({ name: mine, seat: 0 });
  expect(decision(g).spare).toEqual({
    player: 1,
    type: 'creature',
    own: true,
    onlyTypes: true,
    counter: 'vow',
  });
  g.act(1).choosePermanents({ name: theirs, seat: 1 });
  g.passAll();
};

describe('each player keeps one creature, with a vow counter, and sacrifices the rest', () => {
  test('the active player chooses first, then the other; the rest are sacrificed and the lands stay', () => {
    const g = game();
    resolve(g, SPIDER, ANGEL);
    g.expect.counters(SPIDER, { vow: 1 });
    g.expect.counters(ANGEL, { vow: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOBLIN, 'graveyard', { seat: 1 });
    g.expect.zone('Island', 'battlefield', { seat: 1 });
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a player with one creature keeps it without being asked, and it gets the counter', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: BEARS, seat: 0 });
    // Seat 1 has two creatures: asked. Seat 0's choice is made; the Goblin and the Angel are seat 1's.
    expect(decision(g).spare).toEqual({
      player: 1,
      type: 'creature',
      own: true,
      onlyTypes: true,
      counter: 'vow',
    });
  });

  test('a player with no creature is not asked and nothing happens to them', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', BEARS)
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Island')
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, { vow: 1 });
    g.expect.zone('Island', 'battlefield', { seat: 1 });
  });
});

/** Seat 1's turn: seat 0 has a creature kept with the counter, and seat 1 may declare attackers at it. */
const seat1Turn = (g: ScenarioGame) => {
  g.advanceTo('precombatMain', { turn: 'next' });
};

describe('the creatures kept can’t attack the player who cast it (CR 508.1a, 506.3)', () => {
  test('the creature of the opponent with the counter has no one to attack', () => {
    const g = game();
    resolve(g, SPIDER, ANGEL);
    seat1Turn(g);
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANGEL, false);
  });

  test('a creature that arrives later (with haste) attacks as usual: only the creatures of the effect are held back (CR 611.2c)', () => {
    const g = game((b) => b.seat(1).hand(GOBLIN).battlefield('Mountain'));
    resolve(g, SPIDER, ANGEL);
    seat1Turn(g);
    g.act(1).cast(GOBLIN, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANGEL, false);
    g.expect.canAttack(GOBLIN, true);
  });

  test('the creature of the caster is not held back from attacking the other player', () => {
    const g = game();
    resolve(g, SPIDER, ANGEL);
    // It is seat 1's turn next, then seat 0's: seat 0's Spider attacks seat 1 (the restriction protects seat 0 only).
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.expect.canAttack(SPIDER, true);
  });

  test('the planeswalkers of the caster are protected too: the Angel can’t attack the player or the planeswalker', () => {
    const g = game((b) => b.seat(0).battlefield(WALKER));
    resolve(g, SPIDER, ANGEL);
    seat1Turn(g);
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANGEL, false);
  });

  test('without the vow the same Angel could attack the planeswalker of the caster', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WALKER, BEARS)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(ANGEL)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANGEL, true);
  });
});

describe('for as long as it has a vow counter on it (CR 611.2b)', () => {
  test('with the counter removed the creature attacks as usual', () => {
    const g = game();
    resolve(g, SPIDER, ANGEL);
    g.act(0).cast(BREAKER, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.counters(ANGEL, {});
    seat1Turn(g);
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANGEL, true);
  });

  test('the effect of a creature that lost its counter is dropped, the effect of the other stays', () => {
    const g = game();
    resolve(g, SPIDER, ANGEL);
    const bans = () => g.state.continuousEffects.filter((e) => e.change.kind === 'cantAttackSeat');
    expect(bans()).toHaveLength(2);
    g.act(0).cast(BREAKER, { targets: [ANGEL], pay: true });
    g.passAll();
    expect(bans()).toHaveLength(1);
  });

  test('a counter put on the creature again does not bring the effect back: the duration is over for good', () => {
    const g = game();
    resolve(g, SPIDER, ANGEL);
    g.act(0).cast(BREAKER, { targets: [ANGEL], pay: true });
    g.passAll();
    g.act(0).cast(GIVER, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.counters(ANGEL, { vow: 1 });
    seat1Turn(g);
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANGEL, true);
  });
});

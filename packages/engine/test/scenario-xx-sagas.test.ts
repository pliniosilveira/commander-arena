// Saga cards (CR 714): the turn structure of a Saga. It enters with a lore counter (CR 714.3a, a
// replacement effect, so the counter is part of entering); as its controller's precombat main phase
// begins that player puts a lore counter on it (CR 714.3c, a turn-based action: no stack); a chapter
// ability triggers when the counters become at least its number from below (CR 714.2b), "I, II" being
// two abilities (CR 714.2c); a Saga with as many counters as its final chapter number (CR 714.2d) is
// sacrificed (CR 714.4, 704.5s) once none of its chapter abilities is waiting or on the stack. Cards
// are SYNTHETIC (src/cards/fixtures/synthetic-sagas.ts).
import { describe, expect, test } from 'vitest';
import type { CardDefinition } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import {
  chaptersTriggered,
  ECHO,
  FILLER,
  GOLEM,
  RITE,
  resolveTop,
  SURGE,
  TALE,
  viewById,
} from './saga-helpers';

describe('a Saga enters (CR 714.3a)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(RITE)
      .pool('CCW')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('with one lore counter, as part of entering; chapter I triggers at once', () => {
    const g = build();
    g.act(0).cast(RITE, { pay: true });
    resolveTop(g);
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    g.expect.counters(RITE, { lore: 1 });
    // The counter comes with the permanent, then the chapter triggers; nobody has had priority.
    g.expect.eventLog([
      { kind: 'zoneChanged', toZone: 'battlefield' },
      { kind: 'counterAdded', counter: 'lore', count: 1 },
      { kind: 'abilityTriggered', seat: 0, chapter: 1 },
    ]);
    g.expect.stack([`${RITE} (ability)`]);
    g.expect.pending('priority', 0);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('the stack object and the permanent say which chapter and how many there are', () => {
    const g = build();
    g.act(0).cast(RITE, { pay: true });
    resolveTop(g);
    const onStack = g.state.stack[0];
    if (onStack === undefined) throw new Error('nothing on the stack');
    expect(viewById(g, onStack).chapter).toBe(1);
    const saga = viewById(g, g.id(RITE));
    expect(saga.finalChapter).toBe(3);
    expect(saga.counters.lore).toBe(1);
    expect(saga.chapter).toBeUndefined();
  });

  test('resolving chapter I does its effect and leaves the Saga on the battlefield', () => {
    const g = build();
    g.act(0).cast(RITE, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.expect.life(0, 41);
    g.expect.stack([]);
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    g.expect.counters(RITE, { lore: 1 });
  });

  test('it gets no second counter in the main phase it entered in (CR 714.3c)', () => {
    const g = build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.counters(RITE, { lore: 1 });
  });
});

describe('the precombat main phase (CR 714.3c)', () => {
  const build = (lore0 = 1) =>
    scenario()
      .seat(0)
      .battlefield(RITE, { counters: { lore: lore0 } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('the active player puts a counter on it with no stack, then chapter II triggers', () => {
    const g = build();
    const mark = g.mark();
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.step('precombatMain', { active: 0, turn: 5 });
    g.expect.counters(RITE, { lore: 2 });
    g.expect.eventLog(
      [
        { kind: 'stepBegan', step: 'precombatMain', seat: 0 },
        { kind: 'counterAdded', counter: 'lore', count: 1 },
        { kind: 'abilityTriggered', chapter: 2 },
      ],
      { since: mark },
    );
    g.expect.stack([`${RITE} (ability)`]);
    g.expect.pending('priority', 0);
    resolveTop(g);
    g.expect.life(0, 42);
  });

  test('chapter III triggers on the next one; the Saga stays while it is on the stack, then is sacrificed', () => {
    const g = build(2);
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.counters(RITE, { lore: 3 });
    g.expect.stack([`${RITE} (ability)`]);
    // CR 714.4: it is the source of a chapter ability that has not left the stack, so it stays.
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    g.pass(); // seat 0 passes with the ability on the stack
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    g.pass(); // seat 1 passes: the ability resolves
    g.expect.life(0, 44);
    // The ability has left the stack: the state-based action sacrifices the Saga (CR 704.5s).
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
    g.expect.noObject(RITE, { zone: 'battlefield' });
    g.expect.eventLog([
      { kind: 'resolved' },
      { kind: 'zoneChanged', fromZone: 'battlefield', toZone: 'graveyard' },
      { kind: 'sacrificed', controller: 0 },
    ]);
    g.expect.invariants();
  });

  test('all three chapters in order over three of its controller turns', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .pool('CCW')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(RITE, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.expect.life(0, 41);
    g.advanceTo('precombatMain', { turn: 5 });
    resolveTop(g);
    g.expect.life(0, 43);
    g.advanceTo('precombatMain', { turn: 7 });
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    resolveTop(g);
    g.expect.life(0, 47);
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
    expect(chaptersTriggered(g)).toEqual([1, 2, 3]);
  });

  test("a Saga advances only on its controller's turn", () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, { counters: { lore: 1 } })
      .library(...FILLER)
      .seat(1)
      .battlefield(TALE, { counters: { lore: 1 } })
      .library(...FILLER)
      .build();
    g.advanceTo('precombatMain', { turn: 4 });
    g.expect.step('precombatMain', { active: 1, turn: 4 });
    g.expect.counters(TALE, { lore: 2 });
    g.expect.counters(RITE, { lore: 1 });
    g.expect.stack([`${TALE} (ability)`]);
    const top = g.state.stack[0];
    if (top === undefined) throw new Error('nothing on the stack');
    expect(g.object(top).controller).toBe(1);
    resolveTop(g);
    g.expect.life(1, 42);
    g.expect.life(0, 40);
    g.expect.zone(TALE, 'graveyard', { seat: 1 });
  });

  test('two Sagas of one player: both get a counter, their chapters are ordered by the player', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, { counters: { lore: 1 } })
      .battlefield(TALE, { counters: { lore: 1 } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.counters(RITE, { lore: 2 });
    g.expect.counters(TALE, { lore: 2 });
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(RITE, TALE);
    // The Rite ability went on first, so Brief Tale's chapter II resolves first.
    g.expect.stack([`${TALE} (ability)`, `${RITE} (ability)`]);
    resolveTop(g);
    g.expect.life(0, 42);
    // Brief Tale is done and Rite of Three's chapter II is still on the stack.
    g.expect.zone(TALE, 'graveyard', { seat: 0 });
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    resolveTop(g);
    g.expect.life(0, 44);
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    g.expect.counters(RITE, { lore: 2 });
  });
});

describe('a chapter ability for two chapters, "I, II" (CR 714.2c)', () => {
  test('triggers on chapter I and again on chapter II, then III is its own ability', () => {
    const g = scenario()
      .seat(0)
      .hand(ECHO)
      .pool('CU')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(ECHO, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.expect.life(0, 41);
    g.advanceTo('precombatMain', { turn: 5 });
    resolveTop(g);
    g.expect.life(0, 42);
    g.advanceTo('precombatMain', { turn: 7 });
    resolveTop(g);
    g.expect.life(0, 47);
    g.expect.zone(ECHO, 'graveyard', { seat: 0 });
    expect(chaptersTriggered(g)).toEqual([1, 2, 3]);
  });
});

describe('a Saga whose final chapter puts a creature onto the battlefield', () => {
  test('the creature stays after the Saga is sacrificed', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GOLEM, { counters: { lore: 2 } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.counters(GOLEM, { lore: 3 });
    resolveTop(g);
    g.expect.zone(GOLEM, 'graveyard', { seat: 0 });
    g.expect.zone('Golem', 'battlefield', { seat: 0 });
    g.expect.pt('Golem', 3, 3);
    g.expect.invariants();
  });
});

describe('the sacrifice needs nothing waiting (CR 714.4, 704.5s)', () => {
  test('with enough counters and no chapter ability waiting it is sacrificed at the first check', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, { counters: { lore: 3 } })
      .seat(1)
      .build({ settle: true });
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
  });

  test('a player who responds does not make it go early, and a counter beyond the last triggers nothing', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, { counters: { lore: 2 } })
      .battlefield('Plains')
      .hand(SURGE)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.stack([`${RITE} (ability)`]);
    g.act(0).cast(SURGE, { targets: [RITE], pay: true });
    resolveTop(g); // Lore Surge resolves: a fourth counter, past the final chapter
    g.expect.counters(RITE, { lore: 4 });
    g.expect.stack([`${RITE} (ability)`]);
    g.expect.zone(RITE, 'battlefield', { seat: 0 });
    expect(chaptersTriggered(g)).toEqual([3]);
    resolveTop(g);
    g.expect.life(0, 44);
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
  });

  test('a Saga with no chapter abilities is never sacrificed for its counters (CR 714.2d)', () => {
    const base = singleFaceCard({
      name: 'SYNTHETIC Bare Saga',
      manaCost: ['1'],
      types: ['enchantment'],
      subtypes: ['Saga'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
    });
    const bare: CardDefinition = { ...base, layout: 'saga' };
    const g = scenario()
      .define(bare)
      .seat(0)
      .battlefield(bare.name, { counters: { lore: 5 } })
      .seat(1)
      .build({ settle: true });
    g.expect.zone(bare.name, 'battlefield', { seat: 0 });
    g.expect.counters(bare.name, { lore: 5 });
  });
});

// "Double the number of +1/+1 counters on ..." and "Proliferate X times" (`doubleCounters`, the `times` of `proliferate`).
// Pins: CR 701.10 (Double), CR 122.6 (counters put on an object by a player), CR 101.2 (a "can't have counters" effect wins), CR 701.34a
// (Proliferate: each time is a choice of its own). Cards are SYNTHETIC (src/cards/fixtures/synthetic-counter-doubling.ts and others).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const DRAUGHT = 'SYNTHETIC Doubling Draught';
const TIDE = 'SYNTHETIC Doubling Tide';
const SPREAD_X = 'SYNTHETIC Spreading Growth X';
const NO_GROWTH = 'SYNTHETIC Growth Ward'; // creatures you control can't have +1/+1 counters
const BEARS = 'Grizzly Bears';
const LIB = Array.from({ length: 10 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([DRAUGHT, TIDE, SPREAD_X])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('doubleCounters (CR 701.10, 122.6)', () => {
  test('a creature with three +1/+1 counters gets three more, and the event says so', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(DRAUGHT)
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 3 } })
      .build();
    g.act(0).cast(DRAUGHT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 6 });
    g.expect.pt('mine', 8, 8);
    g.expect.eventLog([{ kind: 'counterAdded', counter: '+1/+1', count: 3, by: 0 }]);
  });

  test('only the named kind is doubled', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(DRAUGHT)
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 2, stun: 1 } })
      .build();
    g.act(0).cast(DRAUGHT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 4, stun: 1 });
  });

  test('a creature with no +1/+1 counters gets none and nothing is added', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(DRAUGHT)
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'mine', counters: { '-1/-1': 1 } })
      .build();
    g.act(0).cast(DRAUGHT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', { '-1/-1': 1 });
    g.expect.noEvent({ kind: 'counterAdded' });
  });

  test('each creature of a group is doubled by its own number', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(TIDE)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'a', counters: { '+1/+1': 1 } })
      .battlefield(BEARS, { label: 'b', counters: { '+1/+1': 4 } })
      .battlefield(BEARS, { label: 'c' })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'theirs', counters: { '+1/+1': 2 } })
      .build();
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    g.expect.counters('a', { '+1/+1': 2 });
    g.expect.counters('b', { '+1/+1': 8 });
    g.expect.counters('c', {});
    g.expect.counters('theirs', { '+1/+1': 2 });
  });

  test("a creature that can't have +1/+1 counters is not doubled (CR 101.2)", () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(DRAUGHT)
      .battlefield('Forest')
      .battlefield(NO_GROWTH)
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 3 } })
      .build();
    g.act(0).cast(DRAUGHT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 3 });
    g.expect.noEvent({ kind: 'counterAdded' });
  });
});

describe('proliferate X times (CR 701.34a)', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIB)
      .hand(SPREAD_X)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 1 } })
      .build();

  test('X = 3: three separate choices, each adds one counter', () => {
    const g = board();
    g.act(0).cast(SPREAD_X).x(3).pay();
    g.passAll();
    for (let i = 0; i < 3; i++) {
      const d = g.state.pending;
      if (d?.kind !== 'choosePermanent') throw new Error(`choice ${i}: got ${d?.kind}`);
      expect(d.purpose).toBe('proliferate');
      g.choose({ kind: 'choosePermanents', objects: [g.id('mine')], players: [] });
    }
    g.expect.counters('mine', { '+1/+1': 4 });
  });

  test('X = 2, declining the second time: one counter only', () => {
    const g = board();
    g.act(0).cast(SPREAD_X).x(2).pay();
    g.passAll();
    g.choose({ kind: 'choosePermanents', objects: [g.id('mine')], players: [] });
    g.act(0).choosePermanents();
    g.expect.counters('mine', { '+1/+1': 2 });
  });

  test('X = 0: nobody is asked', () => {
    const g = board();
    g.act(0).cast(SPREAD_X).x(0).pay();
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.counters('mine', { '+1/+1': 1 });
  });
});

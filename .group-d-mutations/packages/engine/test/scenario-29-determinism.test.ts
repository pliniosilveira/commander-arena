// Scenario 29 (SPEC 12): determinism.
// Pins: SPEC 4.2 "Determinism" (a seed plus an action log reproduce the same game exactly) and
// SPEC 17.1 A6 (state is plain data). All randomness is the seeded PRNG stored in state: the
// starting player (CR 103.1), the shuffles (CR 103.3) and every later random choice.
// The test driver (random-games.ts) chooses actions with its own tiny generator, not the engine's.
import { describe, expect, test } from 'vitest';
import { applyAction, type GameState, getLegalActions, stateHash } from '../src/index';
import { scenario } from '../src/testing/index';
import { firstPolicy, newGame, play, randomPolicy } from './random-games';

describe('SPEC 4.2: the same seed gives the same game', () => {
  test('createGame twice with one seed gives identical states (starting seat, shuffles, hands)', () => {
    const a = newGame(7);
    const b = newGame(7);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a).toEqual(b);
  });

  test('two games with the same seed and the same picks end in the same state', () => {
    const a = play(newGame(5), randomPolicy(99), 1_000);
    const b = play(newGame(5), randomPolicy(99), 1_000);
    expect(a.log).toHaveLength(1_000);
    expect(a.log).toEqual(b.log);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });

  test('two complete games with the same seed end in the same result and state', () => {
    const a = play(newGame(5), firstPolicy, 20_000);
    const b = play(newGame(5), firstPolicy, 20_000);
    expect(a.state.result).not.toBeNull();
    expect(a.state.result).toEqual(b.state.result);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });

  test('replaying the recorded action log on a fresh game reproduces every intermediate state', () => {
    const hashes: string[] = [];
    const first = play(newGame(11), randomPolicy(3), 200, (s) => hashes.push(stateHash(s)));
    let state = newGame(11);
    first.log.forEach(({ seat, action }, i) => {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(`replay rejected action ${i}: ${r.error}`);
      state = r.state;
      expect(stateHash(state), `after action ${i}`).toBe(hashes[i]);
    });
  });

  test('a replayed full game reaches the identical final state, result included', () => {
    const first = play(newGame(21), firstPolicy, 20_000);
    expect(first.state.result).not.toBeNull();
    let state = newGame(21);
    for (const { seat, action } of first.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(state.result).toEqual(first.state.result);
    expect(stateHash(state)).toBe(stateHash(first.state));
  });

  test('the action count is the length of the log', () => {
    const first = play(newGame(2), randomPolicy(4), 300);
    expect(first.state.actionCount).toBe(first.log.length);
  });
});

describe('SPEC 4.2: different seeds give different games', () => {
  test('the starting states of different seeds all differ', () => {
    const hashes = [1, 2, 3, 4, 5, 6].map((seed) => stateHash(newGame(seed)));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  test('the library order differs between seeds (CR 103.3), and is stored in the state', () => {
    const libraryNames = (s: GameState) =>
      (s.seats[0]?.library ?? []).map((id) => {
        const card = s.objects[id]?.card;
        return card === null || card === undefined ? '' : s.cards[card]?.definition;
      });
    expect(libraryNames(newGame(1))).not.toEqual(libraryNames(newGame(2)));
  });

  test('the same deterministic policy on different seeds ends in different states', () => {
    const a = play(newGame(31), firstPolicy, 20_000);
    const b = play(newGame(32), firstPolicy, 20_000);
    expect(stateHash(a.state)).not.toBe(stateHash(b.state));
  });

  test('the same deterministic policy on the same seed ends in the same state', () => {
    const a = play(newGame(31), firstPolicy, 20_000);
    const b = play(newGame(31), firstPolicy, 20_000);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });
});

describe('SPEC 4.2: state is plain data', () => {
  test('a JSON round trip keeps the hash and the state', () => {
    const { state } = play(newGame(3), randomPolicy(17), 300);
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy).toEqual(state);
    expect(stateHash(copy)).toBe(stateHash(state));
  });

  test('play can continue from a round-tripped state to the same end', () => {
    const half = play(newGame(3), randomPolicy(17), 200);
    const copy = JSON.parse(JSON.stringify(half.state)) as GameState;
    const a = play(half.state, randomPolicy(5), 600);
    const b = play(copy, randomPolicy(5), 600);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(a.log).toEqual(b.log);
  });

  test('the hash ignores key insertion order but not array order', () => {
    expect(stateHash({ a: 1, b: { c: 2, d: 3 } })).toBe(stateHash({ b: { d: 3, c: 2 }, a: 1 }));
    expect(stateHash([1, 2])).not.toBe(stateHash([2, 1]));
    expect(stateHash({ a: 1 })).not.toBe(stateHash({ a: 2 }));
  });

  test('getLegalActions is a pure function of the state', () => {
    const { state } = play(newGame(9), randomPolicy(2), 120);
    const seat = state.pending?.seat ?? 0;
    expect(getLegalActions(state, seat)).toEqual(getLegalActions(state, seat));
    expect(stateHash(state)).toBe(stateHash(JSON.parse(JSON.stringify(state))));
  });

  test('applyAction does not change the state it was given', () => {
    const { state } = play(newGame(9), randomPolicy(2), 120);
    const before = stateHash(state);
    const d = state.pending;
    if (d === null) throw new Error('no decision');
    for (const action of getLegalActions(state, d.seat)) applyAction(state, d.seat, action);
    expect(stateHash(state)).toBe(before);
  });
});

describe('the scenario builder is deterministic too', () => {
  const build = (seed: number) =>
    scenario()
      .seed(seed)
      .seat(0)
      .hand('Forest', 'Plains')
      .library('Island', { count: 3 })
      .seat(1)
      .build();

  test('the same scenario gives the same hash; the seed is part of it', () => {
    expect(build(1).hash()).toBe(build(1).hash());
    expect(build(1).hash()).not.toBe(build(2).hash());
  });

  test('a seed decides later random results the same way each time (shuffles)', () => {
    const run = (seed: number) => {
      const g = scenario().seed(seed).seat(0).seat(1).build();
      return g.state.rng;
    };
    expect(run(4)).toEqual(run(4));
    expect(run(4)).not.toEqual(run(5));
  });
});

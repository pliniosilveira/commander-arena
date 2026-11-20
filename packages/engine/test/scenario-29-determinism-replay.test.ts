// Scenario 29 (SPEC 12): determinism, replaying a full game.
// Pins: SPEC 4.2 "Determinism" (a seed plus an action log reproduce the same game exactly). Split
// from scenario-29-determinism.test.ts: each of these plays whole games of up to 20,000 actions
// (about 3.5 s each on a quiet machine), so each has a file of its own and the files spread over
// the CI shards instead of making one shard's worker run them one after the other. Their time
// limit is explicit (30 s) because vitest's 5 s default is wall-clock and a loaded shard can pass it.
import { describe, expect, test } from 'vitest';
import { applyAction, stateHash } from '../src/index';
import { firstPolicy, newGame, play } from './random-games';

/** Whole games of up to 20,000 actions: about 3.5 s of work, so the default 5 s of vitest is too close on a loaded CI shard. */
const HEAVY_TEST_TIMEOUT_MS = 30_000;

describe('SPEC 4.2: the same seed gives the same game', () => {
  test(
    'a replayed full game reaches the identical final state, result included',
    () => {
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
    },
    HEAVY_TEST_TIMEOUT_MS,
  );
});

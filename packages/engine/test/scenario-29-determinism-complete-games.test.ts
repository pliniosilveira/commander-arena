// Scenario 29 (SPEC 12): determinism, complete games.
// Pins: SPEC 4.2 "Determinism" (a seed plus an action log reproduce the same game exactly). Split
// from scenario-29-determinism.test.ts: each of these plays whole games of up to 20,000 actions
// (about 3.5 s each on a quiet machine), so each has a file of its own and the files spread over
// the CI shards instead of making one shard's worker run them one after the other. Their time
// limit is explicit (30 s) because vitest's 5 s default is wall-clock and a loaded shard can pass it.
import { describe, expect, test } from 'vitest';
import { stateHash } from '../src/index';
import { firstPolicy, newGame, play } from './random-games';

/** Whole games of up to 20,000 actions: about 3.5 s of work, so the default 5 s of vitest is too close on a loaded CI shard. */
const HEAVY_TEST_TIMEOUT_MS = 30_000;

describe('SPEC 4.2: the same seed gives the same game', () => {
  test(
    'two complete games with the same seed end in the same result and state',
    () => {
      const a = play(newGame(5), firstPolicy, 20_000);
      const b = play(newGame(5), firstPolicy, 20_000);
      expect(a.state.result).not.toBeNull();
      expect(a.state.result).toEqual(b.state.result);
      expect(stateHash(a.state)).toBe(stateHash(b.state));
    },
    HEAVY_TEST_TIMEOUT_MS,
  );
});

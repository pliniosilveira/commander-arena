// The soak for 3 and 4 seats on the real precons (issue 585). It protects what only a table of three
// or four players uses: leaving the game (CR 800.4a), several defenders, the host of each AI seat.
// Each seat keeps its own precon (`tableSets`); the agents rotate. The default logical clock keeps the
// result independent of the machine. Skipped in the pull request tier like the two-seat soak.
import { AGENT_FACTORIES, playTable } from '@commander-arena/ai';
import { describe, expect, test } from 'vitest';
import { newLostSeatCounters, watchedFactory } from './lost-seat-counters.ts';
import { loadPreconDecks, tableSets } from './precons.ts';

const TIMEOUT_MS = 1_800_000;
const soakDescribe = process.env.TEST_TIER === 'pr' ? describe.skip : describe;
// The limits of the measurement of #527; the 100 turns of the probe cut games the agents finish.
const CASES = [
  { seats: 3, games: 6, limits: { maxTurns: 300, maxActions: 30_000 } },
  { seats: 4, games: 4, limits: { maxTurns: 400, maxActions: 40_000 } },
] as const;

soakDescribe('the 3 and 4 seat precon soak', () => {
  for (const { seats, games, limits } of CASES) {
    test(
      `${seats} seats: every game finishes with no fallback, no rejected action and nothing left under a seat that left`,
      async () => {
        const { decks } = await loadPreconDecks();
        const counters = newLostSeatCounters();
        const kinds = [AGENT_FACTORIES.heuristic, AGENT_FACTORIES.casual];
        const agents = Array.from({ length: seats }, (_, k) =>
          watchedFactory(kinds[k % kinds.length] ?? AGENT_FACTORIES.heuristic, counters),
        );
        const result = await playTable({
          agents,
          decks: tableSets(decks, seats),
          games,
          baseSeed: 1,
          limits,
        });
        expect(result.games).toBe(games);
        expect(
          result.unfinished,
          JSON.stringify(result.log.filter((g) => g.end !== 'result')),
        ).toBe(0);
        expect(result.fallbacks).toBe(0);
        expect(result.rejectedActions).toBe(0);
        expect(result.wins.reduce((a, b) => a + b, 0) + result.draws).toBe(games);
        // CR 800.4j: the active seat that left stays out (a known limit, docs/ROADMAP.md).
        const { activeSeatLost: _known, ...mustBeZero } = counters;
        expect(mustBeZero).toEqual({
          permanentsOfLostPlayer: 0,
          lostSeatAsked: 0,
          stackOfLostPlayer: 0,
        });
      },
      TIMEOUT_MS,
    );
  }
});

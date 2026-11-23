// Games of 3 and 4 seats end with a winner: a player who loses leaves the game (CR 800.4a, issue 336), so nothing stays behind that stops the game from settling.
import { describe, expect, test } from 'vitest';
import { AGENT_FACTORIES, ARENA_DECKS, MATCH_LIMITS, runGame } from '../src/index';

const configFor = (seats: number, seed: number) => ({
  seed,
  decks: Array.from({ length: seats }, (_, i) => ARENA_DECKS[i % ARENA_DECKS.length]).filter(
    (d): d is NonNullable<typeof d> => d !== undefined,
  ),
});

describe('games with several seats play to the end', () => {
  test.each([
    [3, 1],
    [3, 2],
    [3, 3],
    [4, 1],
    [4, 2],
  ])(
    '%i seats, seed %i: a result, no crash, no rejected action',
    async (seats, seed) => {
      const agents = Array.from({ length: seats }, (_, s) =>
        AGENT_FACTORIES.random.create(seed * 10 + s),
      );
      const run = await runGame(configFor(seats, seed), agents, MATCH_LIMITS);
      expect(run.agentErrors).toEqual([]);
      expect(run.rejected).toEqual([]);
      expect(run.result).not.toBeNull();
      // Everyone who lost while the game went on took what they owned with them; the last loss ends the game and keeps its board.
      const emptied = run.state.seats.filter(
        (seat) =>
          seat.hasLost && !Object.values(run.state.objects).some((o) => o.owner === seat.id),
      );
      expect(emptied.length).toBeGreaterThanOrEqual(seats - 2);
    },
    60_000,
  );
});

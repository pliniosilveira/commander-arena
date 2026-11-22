// runGame with one agent per seat, for 3 and 4 seats (issue 362).
import { describe, expect, test } from 'vitest';
import { AGENT_FACTORIES, ARENA_DECKS, runGame } from '../src/index';

const limits = { maxTurns: 6, maxActions: 400 };
const configFor = (seats: number, seed: number) => ({
  seed,
  decks: Array.from({ length: seats }, (_, i) => ARENA_DECKS[i % ARENA_DECKS.length]).filter(
    (d): d is NonNullable<typeof d> => d !== undefined,
  ),
});
const agents = (seats: number, seed: number) =>
  Array.from({ length: seats }, (_, s) => AGENT_FACTORIES.random.create(seed * 10 + s));

describe('runGame with several seats', () => {
  test.each([3, 4])('plays a short seeded %i-seat game, deterministically', async (seats) => {
    const a = await runGame(configFor(seats, 5), agents(seats, 5), limits);
    const b = await runGame(configFor(seats, 5), agents(seats, 5), limits);
    expect(a.state.seats).toHaveLength(seats);
    expect(a.log.length).toBeGreaterThan(seats);
    expect(a.agentErrors).toEqual([]);
    expect(b.log).toEqual(a.log);
  });

  test('refuses an agent count that does not match the decks', async () => {
    await expect(runGame(configFor(3, 1), agents(2, 1), limits)).rejects.toThrow(
      /one agent per seat/,
    );
  });
});

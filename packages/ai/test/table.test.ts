// The table harness (issue 482): three and four agents play one deck, each seed once for each rotation, so every agent sits in every seat on the same shuffles. Small limits: the point is
// the bookkeeping (who sat where, who won, determinism), not the quality of play.
import { describe, expect, test } from 'vitest';
import { AGENT_FACTORIES, ARENA_DECKS, playTable, type TableOptions } from '../src/index';

const deck = ARENA_DECKS.map((d) => (Array.isArray(d) ? d[0] : d));
const options = (agents: TableOptions['agents'], games: number): TableOptions => ({
  agents,
  decks: deck,
  games,
  baseSeed: 1,
  limits: { maxTurns: 10, maxActions: 800 },
});
const three = [AGENT_FACTORIES.random, AGENT_FACTORIES.casual, AGENT_FACTORIES.greedy];

describe('playTable', () => {
  test('each seed is played once for each rotation, so every agent sits in every seat', async () => {
    const r = await playTable(options(three, 3));
    expect(r.seats).toBe(3);
    expect(r.log.map((g) => [g.seed, g.rotation])).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
    expect(r.labels).toEqual(['random', 'casual', 'greedy']);
  }, 60_000);

  test('every game is a win, a draw or unfinished, and the tallies agree', async () => {
    const r = await playTable(options(three, 3));
    const won = r.wins.reduce((a, b) => a + b, 0);
    expect(won + r.draws + r.unfinished).toBe(3);
    expect(r.winsBySeat.reduce((a, b) => a + b, 0)).toBe(won);
    expect(r.winsByAgentSeat.flat().reduce((a, b) => a + b, 0)).toBe(won);
    for (const g of r.log) {
      // The winner is the agent that sat in the winning seat in this rotation.
      if (g.winner !== null && g.winnerSeat !== null) {
        expect((g.winner + g.rotation) % 3).toBe(g.winnerSeat);
      }
    }
  }, 60_000);

  test('the same options give the same result', async () => {
    const a = await playTable(options(three, 3));
    const b = await playTable(options(three, 3));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 60_000);

  test('four agents are played in four rotations', async () => {
    const four = [...three, AGENT_FACTORIES.heuristic];
    const r = await playTable(options(four, 4));
    expect(r.seats).toBe(4);
    expect(r.log.map((g) => g.rotation)).toEqual([0, 1, 2, 3]);
  }, 60_000);

  test('a deck entry with one deck for each seat stays with the seat when the agents rotate, and its length must match the seats', async () => {
    const [a, b, c] = deck;
    if (a === undefined || b === undefined || c === undefined) throw new Error('three arena decks');
    const r = await playTable({ ...options(three, 3), decks: [[a, b, c]] });
    expect(r.log.map((g) => g.rotation)).toEqual([0, 1, 2]);
    await expect(playTable({ ...options(three, 3), decks: [[a, b]] })).rejects.toThrow(
      /3 seats but a deck entry lists 2/,
    );
  }, 60_000);

  test('refuses a game count that is not a multiple of the seats, and a table of one or five', async () => {
    await expect(playTable(options(three, 4))).rejects.toThrow(/multiple of 3/);
    await expect(playTable(options([AGENT_FACTORIES.random], 1))).rejects.toThrow(/two to four/);
    const five = Array.from({ length: 5 }, () => AGENT_FACTORIES.random);
    await expect(playTable(options(five, 5))).rejects.toThrow(/two to four/);
  });
});

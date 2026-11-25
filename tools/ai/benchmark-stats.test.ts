import { describe, expect, test } from 'vitest';
import { eloOf, formatSummary, type PairRecord, pairScore, summarize } from './benchmark-stats.ts';

const pair = (games: PairRecord['games'], seed = 1, deck = 0): PairRecord => ({
  seed,
  deck,
  games,
  turns: [10, 12],
});

describe('the benchmark statistics', () => {
  test('a pair scores the mean of its two games; a draw and a game without a result count a half', () => {
    expect(pairScore(pair(['win', 'win']))).toBe(1);
    expect(pairScore(pair(['win', 'loss']))).toBe(0.5);
    expect(pairScore(pair(['draw', 'loss']))).toBe(0.25);
    expect(pairScore(pair(['unfinished', 'win']))).toBe(0.75);
  });

  test('even results give a score of one half and an inconclusive verdict', () => {
    const pairs = Array.from({ length: 100 }, (_, i) =>
      pair(i % 2 === 0 ? ['win', 'win'] : ['loss', 'loss'], i),
    );
    const s = summarize(pairs);
    expect(s.score).toBe(0.5);
    expect(s.elo).toBe(0);
    expect(s.low).toBeLessThan(0.5);
    expect(s.high).toBeGreaterThan(0.5);
    expect(s.verdict).toBe('inconclusive');
    expect(s).toMatchObject({ pairs: 100, games: 200, wins: 100, losses: 100, averageTurns: 11 });
  });

  test('a clear edge over many pairs is a verdict; the same edge over few pairs is not', () => {
    const edge = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        pair(i % 4 === 0 ? ['loss', 'loss'] : ['win', 'loss'], i),
      );
    // Pair scores 0.5 three times in four and 0 once: a mean of 0.375.
    expect(summarize(edge(400)).verdict).toBe('worse');
    expect(summarize(edge(8)).verdict).toBe('inconclusive');
    const flipped = Array.from({ length: 400 }, (_, i) =>
      pair(i % 4 === 0 ? ['win', 'win'] : ['win', 'loss'], i),
    );
    expect(summarize(flipped).verdict).toBe('better');
  });

  test('the interval stays within 0 and 1, and one pair gives the whole range', () => {
    const all = summarize(Array.from({ length: 10 }, (_, i) => pair(['win', 'win'], i)));
    expect(all).toMatchObject({ score: 1, low: 1, high: 1, elo: null, verdict: 'better' });
    expect(summarize([pair(['win', 'loss'])])).toMatchObject({ low: 0, high: 1 });
  });

  test('the Elo of a score of 3/4 is about +191', () => {
    expect(eloOf(0.75)).toBeCloseTo(190.85, 1);
    expect(eloOf(0.25)).toBeCloseTo(-190.85, 1);
  });

  test('the report names the agents, the verdict and the score of each deck', () => {
    const text = formatSummary([pair(['win', 'win'], 1, 0), pair(['loss', 'win'], 2, 1)], {
      candidate: 'this branch',
      baseline: 'main',
      deckNames: ['Alpha', 'Beta'],
    });
    expect(text).toContain('## AI benchmark: this branch against main');
    expect(text).toContain('**Verdict: inconclusive.** Candidate score 75.0%');
    expect(text).toContain('| Alpha | 1 | 100.0% |');
    expect(text).toContain('| Beta | 1 | 50.0% |');
  });
});

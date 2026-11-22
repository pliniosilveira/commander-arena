import type { MatchResult, TableResult } from '@commander-arena/ai';
import { describe, expect, test } from 'vitest';
import { formatMatch, formatRound, formatTable, formatTimes, percentile } from './format.ts';

const result: MatchResult = {
  a: 'casual',
  b: 'greedy',
  games: 4,
  wins: { a: 1, b: 3 },
  winsByAgentSeat: { a: [1, 0], b: [1, 2] },
  winsBySeat: [2, 2],
  draws: 0,
  unfinished: 0,
  averageTurns: 31.25,
  fallbacks: 0,
  rejectedActions: 0,
  reasons: { a: {}, b: { land: 5, curve: 2, 'no-play': 9 } },
  log: [],
};

describe('formatMatch', () => {
  const text = formatMatch(result, { seed: 7, command: 'node tools/ai/arena.ts --seed 7' });

  test('shows wins per agent and seat, draws, turns and fallbacks', () => {
    expect(text).toContain('casual (a) vs greedy (b): 4 games, 2 seeds from 7');
    expect(text).toMatch(/a casual\s+1 \(25\.0%\)\s+1\s+0/);
    expect(text).toMatch(/b greedy\s+3 \(75\.0%\)\s+1\s+2/);
    expect(text).toContain('wins by seat: seat 0 2, seat 1 2');
    expect(text).toContain('draws: 0, unfinished (cap or stuck): 0');
    expect(text).toContain('average turns: 31.3');
    expect(text).toContain('fallbacks: 0, rejected actions: 0');
  });

  test('lists the reasons most frequent first, and says when an agent does not explain itself', () => {
    expect(text).toContain('reasons b: no-play 9, land 5, curve 2');
    expect(text).toContain('reasons a: (none');
  });

  test('prints the command that reproduces the run', () => {
    expect(text).toContain('command: node tools/ai/arena.ts --seed 7');
  });
});

describe('formatTimes', () => {
  test('prints the mean and the slowest decision of each agent against the budget', () => {
    const text = formatTimes(
      [
        { label: 'heuristic', decisions: 4, totalMs: 10, slowestMs: 6.25 },
        { label: 'random', decisions: 0, totalMs: 0, slowestMs: 0 },
      ],
      1000,
    );
    expect(text).toContain(
      'decision time heuristic: 4 decisions, mean 2.50 ms, slowest 6.3 ms (budget 1000 ms)',
    );
    expect(text).toContain('decision time random: 0 decisions, mean 0.00 ms');
  });

  test('says how many decisions went over the budget when they were counted', () => {
    const text = formatTimes(
      [{ label: 'heuristic', decisions: 4, totalMs: 10, slowestMs: 1200, overBudget: 1 }],
      1000,
    );
    expect(text).toContain('(budget 1000 ms, 1 over it)');
  });
});

describe('formatTable', () => {
  const table: TableResult = {
    labels: ['casual', 'greedy', 'heuristic'],
    seats: 3,
    games: 6,
    wins: [1, 2, 3],
    winsByAgentSeat: [
      [1, 0, 0],
      [0, 1, 1],
      [1, 1, 1],
    ],
    winsBySeat: [2, 2, 2],
    draws: 0,
    unfinished: 0,
    averageTurns: 20.5,
    fallbacks: 0,
    rejectedActions: 0,
    reasons: [{}, { land: 3 }, {}],
    log: [],
  };
  const text = formatTable(table, { seed: 4, command: 'node tools/ai/arena.ts --seats 3' });

  test('shows wins for each agent and seat, and the seats of the table', () => {
    expect(text).toContain(
      '6 games at 3 seats, 2 seeds from 4, each played once for each rotation',
    );
    expect(text).toMatch(/0 casual\s+1 \(16\.7%\)\s+1\s+0\s+0/);
    expect(text).toMatch(/2 heuristic\s+3 \(50\.0%\)\s+1\s+1\s+1/);
    expect(text).toContain('wins by seat: seat 0 2, seat 1 2, seat 2 2');
  });

  test('lists the reasons of each agent', () => {
    expect(text).toContain('reasons 1 greedy: land 3');
    expect(text).toContain('reasons 0 casual: (none: the agent does not explain itself)');
  });
});

describe('percentile and formatRound', () => {
  test('the percentile is taken by rank and an empty list is 0', () => {
    expect(percentile([], 0.95)).toBe(0);
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(
      percentile(
        Array.from({ length: 100 }, (_, i) => i + 1),
        0.95,
      ),
    ).toBe(96);
    expect(percentile([7], 0.99)).toBe(7);
  });

  test('a round is one turn of every seat: the decisions and the time are per turn and per round', () => {
    const text = formatRound({ decisions: 600, ms: 3000, turns: 60, seats: 3 });
    expect(text).toBe(
      'per turn: 10.0 decisions, 50.0 ms; per round of 3 turns: 30.0 decisions, 150.0 ms',
    );
    expect(formatRound({ decisions: 0, ms: 0, turns: 0, seats: 3 })).toBe(
      'per turn: no turns played',
    );
  });

  test('the times line shows the 95th percentile when it is given', () => {
    const line = formatTimes(
      [{ label: 'casual', decisions: 10, totalMs: 20, slowestMs: 9, p95Ms: 5.5 }],
      5000,
    );
    expect(line).toContain('95th percentile 5.5 ms');
  });
});

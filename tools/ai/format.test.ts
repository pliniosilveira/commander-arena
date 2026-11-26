import type {
  MatchResult,
  PlanWork,
  SearchWork,
  TableReport,
  TableResult,
} from '@commander-arena/ai';
import { describe, expect, test } from 'vitest';
import {
  formatMatch,
  formatPlanning,
  formatRound,
  formatSearches,
  formatTable,
  formatTableReport,
  formatTimes,
  percentile,
} from './format.ts';

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

describe('formatPlanning', () => {
  const work = (o: Partial<PlanWork> = {}): PlanWork => ({
    planned: true,
    playOuts: 4,
    deepPlayOuts: 0,
    deepUnits: 0,
    steps: 100,
    views: 30,
    applies: 110,
    cut: null,
    ms: 2,
    ...o,
  });

  test('counts the plannings, the share each cut ended and the mean work of one planning', () => {
    const failed = work({
      planned: false,
      cut: 'clock',
      playOuts: 0,
      steps: 0,
      views: 2,
      applies: 0,
      ms: 4,
    });
    expect(formatPlanning('heuristic', [work(), failed, work({ cut: 'work' }), work()])).toBe(
      'planning heuristic: 4 plannings, 3 with a plan; cut by the clock 25.0%, by a work bound 25.0%; ' +
        'per planning: 23.0 views, 82.5 engine actions, 3.0 play-outs, 75.0 steps, 2.50 ms',
    );
  });

  test('adds what the deepening cost when any planning looked a turn further', () => {
    const deep = work({ deepPlayOuts: 6, deepUnits: 3000 });
    expect(
      formatPlanning('heuristic', [deep, work(), work({ deepPlayOuts: 10, deepUnits: 5000 })]),
    ).toContain('deepened 66.7%: 8.0 deep play-outs, 4000.0 work units each');
  });

  test('counts the deepened plannings whose choice the deeper values changed', () => {
    const record = { ...work({ deepPlayOuts: 4, deepUnits: 100 }), deepChanged: true };
    expect(
      formatPlanning('heuristic', [record, work({ deepPlayOuts: 4, deepUnits: 100 })]),
    ).toContain('50.0% of them changed the choice');
  });

  test('says nothing for an agent that never planned', () => {
    expect(formatPlanning('greedy', [])).toBeNull();
  });
});

describe('formatSearches', () => {
  const search = (o: Partial<SearchWork> = {}): SearchWork => ({
    kind: 'priority',
    calls: 100,
    units: 1500,
    cut: null,
    ms: 10,
    ...o,
  });

  test('counts the decisions that searched, the share each cut stopped and the mean work of one', () => {
    const searches = [
      search(),
      search({ kind: 'declareAttackers', cut: 'clock', calls: 20, units: 300, ms: 30 }),
      search({ cut: 'work' }),
      search({ cut: 'work', calls: 180, units: 2700, ms: 0 }),
    ];
    expect(formatSearches('heuristic', searches)).toBe(
      'searches heuristic: 4 decisions searched; cut by the clock 25.0%, by the work budget 50.0%; ' +
        'per decision: 100.0 engine calls, 1500 work units, 12.50 ms',
    );
  });

  test('says how often the combat look-ahead ran and changed the choice', () => {
    const searches = [
      search({ kind: 'declareAttackers', look: { playOuts: 4, changed: true } }),
      search({ kind: 'declareBlockers', look: { playOuts: 2, changed: false } }),
      search(),
    ];
    expect(formatSearches('heuristic', searches)).toContain(
      'combat look-ahead 2 times (3.0 play-outs each), 50.0% of them changed the choice',
    );
    expect(formatSearches('heuristic', [search()])).not.toContain('combat look-ahead');
  });

  test('says nothing for an agent that never searched', () => {
    expect(formatSearches('greedy', [])).toBeNull();
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

describe('formatTableReport', () => {
  const report: TableReport = {
    seats: 4,
    games: 8,
    bySeat: [
      { games: 8, wins: 0, meanPlace: 3.5 },
      { games: 8, wins: 2, meanPlace: 2.5 },
      { games: 8, wins: 2, meanPlace: 2.25 },
      { games: 8, wins: 4, meanPlace: 1.75 },
    ],
    byPosition: [
      { games: 8, wins: 3, meanPlace: 2.25 },
      { games: 8, wins: 1, meanPlace: 2.75 },
      { games: 8, wins: 2, meanPlace: 2.5 },
      { games: 8, wins: 2, meanPlace: 2.5 },
    ],
    agents: [
      {
        label: 'heuristic',
        wins: 2,
        survival: {
          games: 8,
          meanPlace: 2.5,
          firstOut: 2,
          eliminated: 6,
          meanEliminationTurn: 31.8,
          causes: { life: 5, commander: 1 },
        },
        attack: {
          attacks: 31,
          allIn: 26,
          meanPower: 18.2,
          allInThenOut: 1,
          atLowest: 20,
          notLowest: 5,
          ties: 8,
          tiesAtLowestSeat: 6,
          exposedAllIn: 4,
          exposedAllInOut: 1,
        },
        block: {
          declarations: 12,
          noBlocks: 5,
          lethal: 4,
          unblocked: 319,
          avoidable: 118,
          avoidableAtLeast5: 2,
          avoidableAtLeast10: 2,
        },
        removal: {
          casts: 6,
          tokens: 0,
          bands: [0, 1, 1, 4],
          meanShareOfBest: 0.91,
          atAttacker: 0,
          atAttackerOfMine: 0,
        },
      },
    ],
  };
  const text = formatTableReport(report);

  test('reads survival, the race, blocks and removal of each agent, with their denominators', () => {
    expect(text).toContain('table report: 8 games at 4 seats');
    expect(text).toContain('by seat number: 0 0/8 (0.0%) place 3.50 | 1 2/8 (25.0%)');
    expect(text).toContain('by turn order (0 took the first turn): 0 3/8 (37.5%) place 2.25');
    expect(text).toContain('mean place 2.50 (1 best), wins 2, first out 2, eliminated 6/8');
    expect(text).toContain('mean elimination turn 31.8, by life 5, commander 1');
    expect(text).toContain('all-in 26 (83.9%)');
    expect(text).toContain('at the lowest-life opponent 20 (80.0%), at another 5');
    expect(text).toContain('ties for the lowest 8, of which at the lowest seat number 6 (75.0%)');
    expect(text).toContain('no block 5 (41.7%)');
    expect(text).toContain('avoidable 118 (37.0%)');
    expect(text).toContain('by value <2 / 2-4 / 4-6 / 6+: 0 / 1 / 1 / 4');
  });

  test('an agent that never faced an attack or cast removal prints dashes, not NaN', () => {
    const empty = formatTableReport({
      ...report,
      agents: [
        {
          ...(report.agents[0] as TableReport['agents'][number]),
          attack: {
            attacks: 0,
            allIn: 0,
            meanPower: 0,
            allInThenOut: 0,
            atLowest: 0,
            notLowest: 0,
            ties: 0,
            tiesAtLowestSeat: 0,
            exposedAllIn: 0,
            exposedAllInOut: 0,
          },
          block: {
            declarations: 0,
            noBlocks: 0,
            lethal: 0,
            unblocked: 0,
            avoidable: 0,
            avoidableAtLeast5: 0,
            avoidableAtLeast10: 0,
          },
        },
      ],
    });
    expect(empty).not.toContain('NaN');
    expect(empty).toContain('all-in 0 (-)');
  });
});

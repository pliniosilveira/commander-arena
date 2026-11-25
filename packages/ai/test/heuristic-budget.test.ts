// The budget of a decision (issue 653, step 2): the work units its searches may use, the projection of the
// next candidate, the limit after which a running play-out is dropped, and the clock as a safety cutoff
// (D-164, D-172). Pure: the engine calls are real, the clock is a number the test sets.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BUDGET_MS } from '../src/agent';
import {
  CALL_COST,
  HARD_SHARE,
  NO_BUDGET,
  SEARCH_SHARE,
  startBudget,
  WORK_BOUNDS,
  WORK_BUDGET,
  WORK_LIMIT,
  Work,
} from '../src/heuristic-budget';

/** A board of three permanents, the active player in its main phase. */
const board = () =>
  scenario()
    .seat(0)
    .battlefield('Forest', 'Forest', 'Grizzly Bears')
    .library('Island', { count: 5 })
    .seat(1)
    .library('Island', { count: 5 })
    .at('precombatMain', { active: 0 })
    .build();

function budgetAt(budgetMs: number, bounds = { budget: 1000, limit: 1200 }) {
  const clock = { t: 100 };
  const budget = startBudget({ budgetMs, now: () => clock.t }, bounds);
  return { clock, budget };
}

describe('the work of a decision', () => {
  test('every engine call costs CALL_COST units plus one per permanent on the battlefield it reads', () => {
    const g = board();
    const work = new Work();
    work.view(g.state, 0);
    expect(work.calls).toBe(1);
    expect(work.units).toBe(CALL_COST + 3);
    const passed = work.apply(g.state, 0, { kind: 'pass' });
    expect(passed.ok).toBe(true);
    expect(work.calls).toBe(2);
    expect(work.units).toBe(2 * (CALL_COST + 3));
  });

  test('the budget counts what its engine does', () => {
    const g = board();
    const { budget } = budgetAt(1000);
    budget.engine.view(g.state, 0);
    budget.engine.apply(g.state, 0, { kind: 'pass' });
    expect(budget.calls()).toBe(2);
    expect(budget.used()).toBe(2 * (CALL_COST + 3));
  });

  test('a search stops when the work so far plus its own mean candidate would pass the budget', () => {
    const g = board();
    // 13 units a call: 50 calls are 650 units of a budget of 1000.
    const { budget } = budgetAt(1000);
    for (let i = 0; i < 20; i += 1) budget.engine.view(g.state, 0);
    const search = budget.search();
    expect(search.expired(0)).toBeNull();
    for (let i = 0; i < 30; i += 1) budget.engine.view(g.state, 0);
    // The search has used 390 units on 1 candidate: the next one would end at 1040, past the budget.
    expect(search.expired(1)).toBe('work');
    // The same 390 units on 3 candidates: the next costs 130 and ends at 780, inside it.
    expect(search.expired(3)).toBeNull();
    // Without a count only the work used so far counts.
    expect(search.expired(0)).toBeNull();
    // A search that starts later projects from its own candidates only.
    const later = budget.search();
    budget.engine.view(g.state, 0);
    expect(later.expired(1)).toBeNull();
    expect(budget.over()).toBeNull();
    for (let i = 0; i < 50; i += 1) budget.engine.view(g.state, 0);
    // 1313 units: past the budget and past the limit, where a running play-out is dropped.
    expect(later.expired(0)).toBe('work');
    expect(budget.over()).toBe('work');
    expect(budget.cut()).toBe('work');
  });

  test('the default bounds: the limit of a running play-out is above the budget of the search', () => {
    expect(WORK_BOUNDS).toEqual({ budget: WORK_BUDGET, limit: WORK_LIMIT });
    expect(WORK_LIMIT).toBeGreaterThan(WORK_BUDGET);
  });
});

describe('the safety clock', () => {
  test('a search starts nothing past 60% of the time budget, and a play-out is dropped at 70%', () => {
    expect(SEARCH_SHARE).toBe(0.6);
    expect(HARD_SHARE).toBe(0.7);
    const { clock, budget } = budgetAt(1000);
    const search = budget.search();
    clock.t = 100 + 599;
    expect(search.expired(0)).toBeNull();
    expect(budget.over()).toBeNull();
    clock.t = 100 + 600;
    expect(search.expired(0)).toBe('clock');
    expect(budget.over()).toBeNull();
    clock.t = 100 + 699;
    expect(budget.over()).toBeNull();
    clock.t = 100 + 700;
    expect(budget.over()).toBe('clock');
    expect(budget.elapsed()).toBe(700);
    expect(budget.cut()).toBe('clock');
  });

  test('at the default budget of 5 s it stops a search at 3000 ms and drops a play-out at 3500 ms (D-172)', () => {
    expect(DEFAULT_BUDGET_MS).toBe(5000);
    const { clock, budget } = budgetAt(DEFAULT_BUDGET_MS);
    const search = budget.search();
    clock.t = 100 + 2999;
    expect(search.expired(0)).toBeNull();
    clock.t = 100 + 3000;
    expect(search.expired(0)).toBe('clock');
    expect(budget.over()).toBeNull();
    clock.t = 100 + 3499;
    expect(budget.over()).toBeNull();
    clock.t = 100 + 3500;
    expect(budget.over()).toBe('clock');
  });

  test('with the candidates done it stops when the next one would end past the share', () => {
    const { clock, budget } = budgetAt(1000);
    const search = budget.search();
    // 500 ms for 3 candidates: the next costs about 167 ms, 667 ms is past 600 ms.
    clock.t = 100 + 500;
    expect(search.expired(3)).toBe('clock');
    // The same 500 ms for 6 candidates: the next costs about 83 ms, 583 ms is inside the share.
    expect(search.expired(6)).toBeNull();
  });

  test('the clock is named when both the clock and the work would stop the search', () => {
    const g = board();
    const { clock, budget } = budgetAt(1000, { budget: 10, limit: 10 });
    budget.engine.view(g.state, 0);
    expect(budget.over()).toBe('work');
    clock.t = 100 + 700;
    expect(budget.search().expired(0)).toBe('clock');
    expect(budget.over()).toBe('clock');
    expect(budget.cut()).toBe('clock');
  });

  test('a budget with no deadline never runs out and counts nothing', () => {
    expect(NO_BUDGET.search().expired(5)).toBeNull();
    expect(NO_BUDGET.over()).toBeNull();
    NO_BUDGET.engine.view(board().state, 0);
    expect(NO_BUDGET.used()).toBe(0);
    expect(NO_BUDGET.cut()).toBeNull();
  });
});

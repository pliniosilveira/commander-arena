// The time budget of a decision (M7c, D-164): the share a search may use, the projection of the next
// candidate and the hard limit after which a running play-out is dropped. Pure: the clock is a number
// the test sets.
import { describe, expect, test } from 'vitest';
import { DEFAULT_BUDGET_MS } from '../src/agent';
import { HARD_SHARE, NO_BUDGET, SEARCH_SHARE, startBudget } from '../src/heuristic-budget';

function budgetAt(budgetMs: number) {
  const clock = { t: 100 };
  const budget = startBudget({ budgetMs, now: () => clock.t });
  return { clock, budget };
}

describe('startBudget', () => {
  test('the search share is 60% and the hard limit 70% of the budget, counted from the start', () => {
    expect(SEARCH_SHARE).toBe(0.6);
    expect(HARD_SHARE).toBe(0.7);
    const { clock, budget } = budgetAt(1000);
    clock.t = 100 + 599;
    expect(budget.expired()).toBe(false);
    expect(budget.over()).toBe(false);
    clock.t = 100 + 600;
    expect(budget.expired()).toBe(true);
    expect(budget.over()).toBe(false);
    clock.t = 100 + 699;
    expect(budget.over()).toBe(false);
    clock.t = 100 + 700;
    expect(budget.over()).toBe(true);
    expect(budget.elapsed()).toBe(700);
  });

  test('at the default budget of 5 s the search stops at 3000 ms and the hard limit is 3500 ms (D-172)', () => {
    expect(DEFAULT_BUDGET_MS).toBe(5000);
    const { clock, budget } = budgetAt(DEFAULT_BUDGET_MS);
    clock.t = 100 + 2999;
    expect(budget.expired()).toBe(false);
    clock.t = 100 + 3000;
    expect(budget.expired()).toBe(true);
    expect(budget.over()).toBe(false);
    clock.t = 100 + 3499;
    expect(budget.over()).toBe(false);
    clock.t = 100 + 3500;
    expect(budget.over()).toBe(true);
  });

  test('with the number of candidates done it stops when the next one would end past the share', () => {
    const { clock, budget } = budgetAt(1000);
    // 500 ms for 3 candidates: the next costs about 167 ms, 667 ms is past 600 ms.
    clock.t = 100 + 500;
    expect(budget.expired(3)).toBe(true);
    // The same 500 ms for 6 candidates: the next costs about 83 ms, 583 ms is inside the share.
    expect(budget.expired(6)).toBe(false);
    // Without the count only the time used so far counts.
    expect(budget.expired()).toBe(false);
    expect(budget.expired(0)).toBe(false);
  });

  test('a budget with no deadline never runs out', () => {
    expect(NO_BUDGET.expired(5)).toBe(false);
    expect(NO_BUDGET.over()).toBe(false);
  });
});

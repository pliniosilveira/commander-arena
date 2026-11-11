/**
 * The time budget of one decision (SPEC 9: at most 5 s a decision, A28, D-172). The agent never reads
 * a clock itself: `ctx.now` is injected, so a test can drive a fake one. A search stops, and the best
 * candidate so far is taken, when `SEARCH_SHARE` of the budget is used; the rest is left for the
 * answer, the handlers that run after the search and the host.
 */
import type { GameState } from '@commander-arena/engine';
import type { DecideContext } from './agent';

/** What one decision may use: the clock, the sample (built once, on demand) and the PRNG. */
export interface Think {
  readonly budget: Budget;
  /** A number in [0, n) from the agent's own PRNG. */
  readonly draw: (n: number) => number;
  /** The determinized sample of this decision, or undefined when the host gives none. */
  readonly sample: () => GameState | undefined;
}

/** The share of the budget a search may use before it stops and takes the best so far. */
export const SEARCH_SHARE = 0.6;

/**
 * * The share after which a play-out that is still running is dropped (D-164). The search share is only
 * checked between candidates, and on a board of 80 permanents one candidate took 2.4 seconds; a play-out
 * checks this limit before each engine step, so it overruns by at most one step.
 */
export const HARD_SHARE = 0.7;

export interface Budget {
  /**
   * Whether the search share of the budget is used up. `done` is how many candidates the search has
   * scored so far: with it the check also stops when the NEXT candidate, costing what the ones so far
   * cost on average, would end past the share (D-164: a candidate on a big board takes hundreds of
   * milliseconds, and stopping only once the share is over let a decision run past the budget).
   */
  readonly expired: (done?: number) => boolean;
  /** Whether a running play-out must be dropped now (`HARD_SHARE` of the budget is used). */
  readonly over: () => boolean;
  /** The milliseconds used so far. */
  readonly elapsed: () => number;
}

export function startBudget(ctx: DecideContext): Budget {
  const start = ctx.now();
  const limit = SEARCH_SHARE * ctx.budgetMs;
  const hardLimit = HARD_SHARE * ctx.budgetMs;
  return {
    expired: (done = 0) => {
      const used = ctx.now() - start;
      return used + (done > 0 ? used / done : 0) >= limit;
    },
    over: () => ctx.now() - start >= hardLimit,
    elapsed: () => ctx.now() - start,
  };
}

/** A budget that never runs out (a decision answered from the view alone). */
export const NO_BUDGET: Budget = { expired: () => false, over: () => false, elapsed: () => 0 };

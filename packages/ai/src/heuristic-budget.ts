/**
 * The budget of one decision (issue 653, step 2): an amount of engine work, the same on every device, with the
 * decision's clock kept only as a safety cutoff.
 *
 * WORK. Every search of a decision plays its candidates out through the decision's `Engine`, which counts
 * each `getView` and `applyAction` it makes and weighs it by the board it reads (`Work`, `CALL_COST`): the
 * vetting of today's plays and the window plays (`heuristic-delta.ts`, `heuristic-main.ts`,
 * `heuristic-protect.ts`), the turn planner (`heuristic-plan.ts`, through its memo, so a step it kept costs
 * nothing), and the attack and block searches. They draw from one budget of `WORK_BUDGET` units in the order
 * the decision runs them: on a priority decision today's choice and its vetting first, then the planner; on a
 * combat decision the attack or the block search. A search starts its next candidate only when the work so
 * far plus what one of its own candidates has cost on average fits in `WORK_BUDGET`, and a play-out still
 * running at `WORK_LIMIT` is dropped. A decision therefore does the same work on a slow device as on a fast
 * one, and the benchmark (a logical clock) plays as the web app does, unless the clock cuts it.
 *
 * DEEPENING (step 4). A planning with two players may look one more turn ahead at its best lines
 * (`heuristic-plan-deep.ts`). That phase draws from the same budget with every bound stretched `DEEP_FACTOR`
 * times (`Budget.deep`): the work budget and limit, and the two shares of the clock. So a decision that deepens
 * stops searching at `DEEP_FACTOR * SEARCH_SHARE` of the time budget (6 s of 5 s) and drops a running play-out
 * at `DEEP_FACTOR * HARD_SHARE` of it (7 s), still inside the host's watchdog (SPEC 9, A28).
 *
 * CLOCK. The agent never reads a clock itself: `ctx.now` is injected (SPEC 9, A28). It only guards the time
 * limit (SPEC 9: at most 5 s a decision, D-172), far above what a decision normally costs: a search starts no
 * candidate once `SEARCH_SHARE` of `ctx.budgetMs` is used (with the same projection, in time), and a running
 * play-out is dropped at `HARD_SHARE`. Only the largest plannings reach it, on a device too slow for the work
 * budget, and only there does a decision differ from the benchmark's; the arena report counts how often (`Cut`).
 */
import {
  type Action,
  type ApplyResult,
  applyAction,
  type DecisionKind,
  type GameState,
  type GameView,
  getView,
  type SeatId,
} from '@commander-arena/engine';
import type { DecideContext } from './agent';
import type { AgentWeights } from './weights';

/** What one decision may use: the budget, the sample (built once, on demand), the PRNG and the weights. */
export interface Think {
  readonly budget: Budget;
  /** The agent's tunable numbers (`weights.ts`). */
  readonly weights: AgentWeights;
  /** A number in [0, n) from the agent's own PRNG. */
  readonly draw: (n: number) => number;
  /** The determinized sample of this decision, or undefined when the host gives none. */
  readonly sample: () => GameState | undefined;
  /**
   * A second determinized sample, dealt again from the agent's own PRNG and built on demand (undefined when the
   * host gives no samples, or in a test that builds a `Think` by hand): the planner's deepening plays the base
   * scenario of it too (`heuristic-plan-deep.ts`).
   */
  readonly resample?: () => GameState | undefined;
}

/**
 * What one engine call costs, in work units, beyond one unit per permanent on the battlefield of the state it
 * reads: the engine derives every permanent's characteristics, so a call on a board of 50 permanents takes
 * several times as long as one on an empty board (measured on the precons: about 0.5 ms plus 0.05 ms a
 * permanent). Weighed this way the work of a planning follows its time far better than a count of calls
 * does, and it stays a pure function of the states the search reads.
 */
export const CALL_COST = 10;

/**
 * The work units the searches of one decision may use before they stop (a bound of the search, not a weight).
 * Set on the precons (issue 653) so that a planning costs about what it cost when the clock bounded it: half
 * of the plannings use under 12,000 units, and about 6 in 100 reach the budget. At about 0.045 ms a unit on
 * the machine measured, a decision that used all of it would take some 3.5 s, so there the safety clock still
 * cuts the largest plannings; on a faster device the budget cuts them first. The pull request of step 2 has
 * the numbers.
 */
export const WORK_BUDGET = 80_000;

/** The work units at which a play-out that is still running is dropped (7/6 of the budget, as the shares). */
export const WORK_LIMIT = 93_000;

/** The share of the time budget after which a search starts no candidate (the safety cutoff). */
export const SEARCH_SHARE = 0.6;

/**
 * The share of the time budget after which a play-out that is still running is dropped (D-164): a
 * play-out checks it before each engine step, so it overruns by at most one step.
 */
export const HARD_SHARE = 0.7;

/**
 * How many times the work bounds and the shares of the clock are stretched for the deepening phase of a
 * planning (a bound of the search, not a weight). 2 puts the search's stop at 6 s and the play-out's at 7 s of
 * the 5 s budget, under the host's watchdog at 7.5 s (SPEC 9).
 */
export const DEEP_FACTOR = 2;

/** What stops a search or drops a play-out: the safety clock, or the work budget. */
export type Cut = 'clock' | 'work';

/** What one decision that searched cost: its engine calls and work, its time and what cut a search. */
export interface SearchWork {
  readonly kind: DecisionKind;
  /** The engine calls of all its searches. */
  readonly calls: number;
  /** Their work units (`Budget.used`). */
  readonly units: number;
  /** The first cut a search met (`Budget.cut`), or null when every search ran to its end. */
  readonly cut: Cut | null;
  /** The milliseconds of the decision's clock it used (0 on a logical clock). */
  readonly ms: number;
  /** For a combat decision whose look-ahead ran (`heuristic-combat-look.ts`): its play-outs and whether it changed the choice. */
  readonly look?: { readonly playOuts: number; readonly changed: boolean };
}

/** The two engine calls of a search: `getView` and `applyAction`. */
export interface Engine {
  readonly view: (state: GameState, seat: SeatId) => GameView;
  readonly apply: (state: GameState, seat: SeatId, action: Action) => ApplyResult;
}

/** The engine itself, uncounted: for a play-out outside any decision's budget (a vote, a test). */
export const DIRECT: Engine = { view: getView, apply: applyAction };

/** The engine calls of one decision, counted (`calls`) and weighed (`units`, see `CALL_COST`). */
export class Work implements Engine {
  /** The `getView` and `applyAction` calls made so far. */
  calls = 0;
  /** Their work units. */
  units = 0;

  private count(state: GameState): void {
    this.calls += 1;
    this.units += CALL_COST + state.battlefield.length;
  }

  readonly view = (state: GameState, seat: SeatId): GameView => {
    this.count(state);
    return getView(state, seat);
  };

  readonly apply = (state: GameState, seat: SeatId, action: Action): ApplyResult => {
    this.count(state);
    return applyAction(state, seat, action);
  };
}

/** One search of a decision: its candidates draw from the decision's budget. */
export interface Search {
  /**
   * What stops the search before its next candidate, or null to go on. `done` is how many candidates this
   * search has played so far: the next one is expected to cost what they cost on average (its own work, or
   * the decision's time so far over `done`, as before), and it is started only when that fits (D-164). The
   * clock is named when both would stop it.
   */
  readonly expired: (done: number) => Cut | null;
}

export interface Budget {
  /** The engine of the decision: every play-out of its searches goes through it. */
  readonly engine: Engine;
  /** The work units used so far. */
  readonly used: () => number;
  /** The engine calls made so far. */
  readonly calls: () => number;
  /** The work units left before searches start no candidate (negative past it; unbounded without a bound). */
  readonly left: () => number;
  /** A search that starts now (it reads no clock: its first check does). */
  readonly search: () => Search;
  /** What drops a running play-out now (`WORK_LIMIT`, or `HARD_SHARE` of the clock), or null. */
  readonly over: () => Cut | null;
  /** The milliseconds of the decision's clock used so far (a read of the clock). */
  readonly elapsed: () => number;
  /**
   * The milliseconds of the decision's clock at its last read, without reading it again: a host measures the
   * decision on the same clock, so the budget reads it no more often than the searches need.
   */
  readonly seen: () => number;
  /** The first cut any search of the decision met, the clock first when both did; null when none did. */
  readonly cut: () => Cut | null;
  /**
   * The same decision's budget (the same work, clock and cut) with every bound `DEEP_FACTOR` times as large,
   * for a planning's deepening phase (see the module comment). A budget that is already deep returns itself.
   */
  readonly deep: () => Budget;
}

/** The bounds of the work of one decision, in work units. */
export interface WorkBounds {
  /** Searches start no candidate past it (`WORK_BUDGET`). */
  readonly budget: number;
  /** A running play-out is dropped at it (`WORK_LIMIT`). */
  readonly limit: number;
}

export const WORK_BOUNDS: WorkBounds = { budget: WORK_BUDGET, limit: WORK_LIMIT };

/** The budget of one decision of `ctx`; `bounds` replaces the work bounds (tests). */
export function startBudget(
  ctx: Pick<DecideContext, 'budgetMs' | 'now'>,
  bounds: WorkBounds = WORK_BOUNDS,
): Budget {
  const start = ctx.now();
  const work = new Work();
  // The clock is read only where the searches check it, as before the work budget: a host measures the
  // decision on the same clock, and a slow one moves with every read.
  let last = 0;
  const read = (): number => {
    last = ctx.now() - start;
    return last;
  };
  let first: Cut | null = null;
  const note = (why: Cut | null): Cut | null => {
    if (why !== null && first !== 'clock') first = why;
    return why;
  };
  // One budget over the shared work and clock; `scale` stretches its bounds (1, or `DEEP_FACTOR`).
  const make = (scale: number): Budget => {
    const searchMs = scale * SEARCH_SHARE * ctx.budgetMs;
    const hardMs = scale * HARD_SHARE * ctx.budgetMs;
    const budgetUnits = scale * bounds.budget;
    const limitUnits = scale * bounds.limit;
    return {
      engine: work,
      used: () => work.units,
      calls: () => work.calls,
      left: () => budgetUnits - work.units,
      search: () => {
        const since = work.units;
        return {
          expired: (done) => {
            const ms = read();
            if (ms + (done > 0 ? ms / done : 0) >= searchMs) return note('clock');
            const next = done > 0 ? (work.units - since) / done : 0;
            const full = work.units >= budgetUnits || work.units + next > budgetUnits;
            return note(full ? 'work' : null);
          },
        };
      },
      over: () => {
        if (read() >= hardMs) return note('clock');
        return note(work.units >= limitUnits ? 'work' : null);
      },
      elapsed: read,
      seen: () => last,
      cut: () => first,
      deep: () => deeper,
    };
  };
  const deeper = make(DEEP_FACTOR);
  return make(1);
}

/** A budget that never runs out and counts nothing (a decision answered from the view alone). */
export const NO_BUDGET: Budget = {
  engine: DIRECT,
  used: () => 0,
  calls: () => 0,
  left: () => Number.POSITIVE_INFINITY,
  search: () => ({ expired: () => null }),
  over: () => null,
  elapsed: () => 0,
  seen: () => 0,
  cut: () => null,
  deep: () => NO_BUDGET,
};

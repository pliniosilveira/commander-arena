/**
 * The turn planner of the HeuristicAgent (issue 624, phase 3). At its first priority decision of a main
 * phase (after the land decision) the agent builds candidate LINES for the whole turn
 * (`heuristic-plan-lines.ts`), plays each on the threat scenarios of the sample (`heuristic-threats.ts`,
 * `heuristic-plan-sim.ts`) to the start of its next turn, and scores the end with `evaluate`. A line's
 * value is the scenarios' weighted mean less `plan.riskAversion` times the gap between that mean and its
 * worst scenario. Lines are scored best guess first within the search share of the budget; today's line
 * is always scored, and another line replaces it only when it beats it by `plan.margin`.
 *
 * The chosen line becomes a `TurnPlan`: the agent's decisions on the base scenario, each with the board
 * print it expected (`heuristic-plan-print.ts`). At a later decision of a window, a step whose print
 * equals the real one and whose action the engine lists is taken at once (reason `plan`), with no search;
 * otherwise the agent plans again from where it is (reason `replan`). After blockers and at the opponent's
 * end step only planned activations are followed (everything else there is today's window rules), and a
 * window with activated abilities is planned on its own when today's rules would pass there.
 */
import type { Action, GameState, GameView, PendingDecision, SeatId } from '@commander-arena/engine';
import { evaluate } from './evaluate';
import type { Think } from './heuristic-budget';
import { type BoardPrint, boardPrint } from './heuristic-plan-print';
import {
  isListed,
  type Line,
  type PlanStep,
  playLine,
  type SimAgents,
  type Window,
} from './heuristic-plan-sim';
import { PlanCounter, type PlanWork } from './heuristic-plan-work';
import { scenariosOf } from './heuristic-threats';

/** The most play-outs of one planning, whatever the clock says (a bound of the search, not a weight). */
const MAX_PLAY_OUTS = 40;
/** The most engine steps of all the play-outs of one planning (a bound of the search, not a weight). */
const MAX_PLAN_STEPS = 6000;

export interface TurnPlan {
  /** The turn the plan was made in. */
  readonly turn: number;
  readonly steps: readonly PlanStep[];
  /** The index of the next step to look for. */
  next: number;
  /** The label of the chosen line and its value, for the log and the tests. */
  readonly line: string;
  readonly score: number;
}

/**
 * What one planning that ended in a plan did, for the measurements of the pull requests and the tests: its
 * work (`PlanWork`: play-outs, engine steps, views, actions, what cut it) and what it chose.
 */
export interface PlanRecord extends PlanWork {
  readonly lines: number;
  readonly scored: number;
  readonly scenarios: number;
  readonly chosen: string;
  /** The value of today's line and of the chosen one. */
  readonly today: number;
  readonly value: number;
  /** The milliseconds of the decision's clock used when it ended. */
  readonly elapsed: number;
  /** The turn and the window it was made in. */
  readonly turn: number;
  readonly window: Window;
}

/** The plan step for `view`'s decision `d` in window `when`, from `plan.next` on, or null. */
export function followPlan(
  plan: TurnPlan | null,
  view: GameView,
  d: PendingDecision,
  when: Window,
): PlanStep | null {
  if (plan === null) return null;
  const print: BoardPrint = boardPrint(view);
  for (let i = plan.next; i < plan.steps.length; i += 1) {
    const step = plan.steps[i] as PlanStep;
    if (step.when !== when || step.expect !== print) continue;
    // After blockers and at the opponent's end step only a planned activation is followed.
    if ((when === 'afterBlocks' || when === 'theirEnd') && step.action.kind !== 'activate')
      return null;
    if (!isListed(step.action, d)) return null;
    plan.next = i + 1;
    return step;
  }
  return null;
}

export interface Planned {
  readonly plan: TurnPlan;
  /** The index of the chosen line (0 is today's). */
  readonly index: number;
  readonly record: PlanRecord;
}

/** One planning: its plan (null when there is none) and its work (the plan's record when there is one). */
export interface Planning {
  readonly planned: Planned | null;
  readonly work: PlanWork;
}

/**
 * Scores `lines` (today's first) for the decision of `view` in window `now` and returns the plan of the
 * chosen one, or no plan when today's line could not be scored (no sample, a refused play-out, no time).
 */
export function choosePlan(
  view: GameView,
  now: Window,
  lines: readonly Line[],
  think: Think,
  agents: SimAgents,
): Planning {
  const started = think.budget.elapsed();
  const work = new PlanCounter(MAX_PLAN_STEPS);
  const none = (): Planning => ({
    planned: null,
    work: work.done(false, think.budget.elapsed() - started),
  });
  const me = view.viewer;
  const sample = think.sample();
  if (sample === undefined || sample.pending?.kind !== 'priority' || sample.pending.seat !== me) {
    return none();
  }
  // Today's choice may have used the search share already (its own vetting on the sample): no planning then.
  if (think.budget.expired()) {
    work.stop('clock');
    return none();
  }
  const weights = think.weights;
  const see = (state: GameState, seat: SeatId): GameView => work.view(state, seat);
  const all = scenariosOf(view, sample, weights, see);
  // With more than one opponent every opponent's turn is played out: fewer scenarios.
  const scenarios = view.seats.length > 2 ? all.slice(0, 2) : all;
  const ctx = { agents, budget: think.budget, weights, work };
  const scored: { index: number; value: number; steps: readonly PlanStep[] }[] = [];
  outer: for (const [i, line] of lines.entries()) {
    const scores: number[] = [];
    let steps: readonly PlanStep[] = [];
    for (const [j, s] of scenarios.entries()) {
      if (i > 0) {
        if (think.budget.expired(work.playOuts)) {
          work.stop('clock');
          break outer;
        }
        if (work.playOuts >= MAX_PLAY_OUTS) {
          work.stop('work');
          break outer;
        }
        // The next line is started only when it can finish at the average cost of the ones so far.
        if (work.steps + work.steps / work.playOuts > MAX_PLAN_STEPS) {
          work.stop('work');
          break outer;
        }
      }
      const result = playLine(s.state, me, line, ctx, j === 0);
      work.playOuts += 1;
      if (result === null) break;
      if (j === 0) steps = result.steps;
      scores.push(evaluate(work.view(result.end, me), me, weights).score);
    }
    if (scores.length < scenarios.length) {
      if (i === 0) break;
      if (think.budget.over()) {
        work.stop('clock');
        break;
      }
      continue;
    }
    const total = scenarios.reduce((sum, s) => sum + s.weight, 0);
    const mean =
      total === 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : scenarios.reduce((sum, s, j) => sum + s.weight * (scores[j] ?? 0), 0) / total;
    const worst = Math.min(...scores);
    scored.push({ index: i, value: mean - weights.plan.riskAversion * (mean - worst), steps });
  }
  const today = scored.find((s) => s.index === 0);
  if (today === undefined) return none();
  let best = today;
  for (const s of scored) {
    if (s.index !== 0 && s.value > today.value + weights.plan.margin && s.value > best.value)
      best = s;
  }
  const first = best.steps[0];
  if (first === undefined || first.when !== now) return none();
  const elapsed = think.budget.elapsed();
  const record: PlanRecord = {
    ...work.done(true, elapsed - started),
    lines: lines.length,
    scored: scored.length,
    scenarios: scenarios.length,
    chosen: lines[best.index]?.label ?? '?',
    today: today.value,
    value: best.value,
    elapsed,
    turn: view.turn,
    window: now,
  };
  const plan: TurnPlan = {
    turn: view.turn,
    steps: best.steps,
    next: 1,
    line: record.chosen,
    score: best.value,
  };
  return { planned: { plan, index: best.index, record }, work: record };
}

/** The first action of a plan (its first step). */
export const firstAction = (p: Planned): Action => (p.plan.steps[0] as PlanStep).action;

/**
 * The turn planner of the HeuristicAgent (issue 624, phase 3). At its first priority decision of a main
 * phase (after the land decision) the agent builds candidate LINES for the whole turn
 * (`heuristic-plan-lines.ts`), plays each on the threat scenarios of the sample (`heuristic-threats.ts`,
 * `heuristic-plan-sim.ts`) to the start of its next turn, and scores the end with `evaluate`. A line's
 * value is the scenarios' weighted mean less `plan.riskAversion` times the gap between that mean and its
 * worst scenario. Lines are scored best guess first within the decision's work budget (`heuristic-budget.ts`);
 * today's line is always scored, and another line replaces it only when it beats it by `plan.margin`.
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
import { deepen, lineValue, type Scored } from './heuristic-plan-deep';
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

/**
 * The most play-outs of one planning (a bound of the search, not a weight): how many lines are scored on how
 * many scenarios. What they may cost is the decision's work budget (`heuristic-budget.ts`).
 */
const MAX_PLAY_OUTS = 40;

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
  /** How many lines were played one turn further on every scenario (`heuristic-plan-deep.ts`; lines the halving dropped or the engine refused do not count); 0 when the deepening did not run. */
  readonly deepLines: number;
  /** Whether the deeper values chose a line other than the one the horizon 1 values chose. */
  readonly deepChanged: boolean;
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
  // The planning's memo; what it has not kept it asks of the decision's engine, counted in its budget.
  const work = new PlanCounter(think.budget.engine);
  const none = (): Planning => ({
    planned: null,
    work: work.done(false, think.budget.elapsed() - started),
  });
  const me = view.viewer;
  const sample = think.sample();
  if (sample === undefined || sample.pending?.kind !== 'priority' || sample.pending.seat !== me) {
    return none();
  }
  // Today's choice may have used the budget already (its own vetting on the sample): no planning then.
  const late = think.budget.search().expired(0);
  if (late !== null) {
    work.stop(late);
    return none();
  }
  const weights = think.weights;
  const see = (state: GameState, seat: SeatId): GameView => work.view(state, seat);
  const all = scenariosOf(view, sample, weights, see);
  // With more than one opponent every opponent's turn is played out: fewer scenarios.
  const scenarios = view.seats.length > 2 ? all.slice(0, 2) : all;
  const ctx = { agents, budget: think.budget, weights, work };
  const scored: Scored[] = [];
  const usedAtStart = think.budget.used();
  // Today's line is always played; each later play-out only when it fits in what is left of the decision's
  // budget at the average cost of the play-outs so far.
  const search = think.budget.search();
  outer: for (const [i, line] of lines.entries()) {
    const scores: number[] = [];
    let steps: readonly PlanStep[] = [];
    for (const [j, s] of scenarios.entries()) {
      if (i > 0) {
        const why = search.expired(work.playOuts);
        if (why !== null) {
          work.stop(why);
          break outer;
        }
        if (work.playOuts >= MAX_PLAY_OUTS) {
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
      const why = think.budget.over();
      if (why !== null) {
        work.stop(why);
        break;
      }
      continue;
    }
    scored.push({
      index: i,
      value: lineValue(scores, scenarios, weights.plan.riskAversion),
      steps,
    });
  }
  const today = scored.find((s) => s.index === 0);
  if (today === undefined) return none();
  const pick = (value: (s: Scored) => number | undefined): Scored => {
    const base = value(today) ?? today.value;
    let best = today;
    let bestValue = base;
    for (const s of scored) {
      const v = value(s);
      if (s.index !== 0 && v !== undefined && v > base + weights.plan.margin && v > bestValue) {
        best = s;
        bestValue = v;
      }
    }
    return best;
  };
  let best = pick((s) => s.value);
  // Two players, every line scored: the lines that came out close are played one turn further (`heuristic-plan-deep.ts`).
  const deep =
    view.seats.length === 2 && work.cut === null
      ? deepen({
          budget: think.budget.deep(),
          me,
          lines,
          scored,
          scenarios,
          ctx,
          weights,
          work,
          perPlayOut: (think.budget.used() - usedAtStart) / Math.max(1, work.playOuts),
        })
      : null;
  let deepChanged = false;
  let deepLines = 0;
  if (deep !== null) {
    deepLines = deep.size;
    const deeper = pick((s) => deep.get(s.index));
    deepChanged = deeper.index !== best.index;
    best = deeper;
  }
  const value = deep?.get(best.index) ?? best.value;
  const first = best.steps[0];
  if (first === undefined || first.when !== now) return none();
  const elapsed = think.budget.elapsed();
  const record: PlanRecord = {
    ...work.done(true, elapsed - started),
    lines: lines.length,
    scored: scored.length,
    scenarios: scenarios.length,
    chosen: lines[best.index]?.label ?? '?',
    today: deep?.get(0) ?? today.value,
    value,
    elapsed,
    turn: view.turn,
    window: now,
    deepLines,
    deepChanged,
  };
  const plan: TurnPlan = {
    turn: view.turn,
    steps: best.steps,
    next: 1,
    line: record.chosen,
    score: value,
  };
  return { planned: { plan, index: best.index, record }, work: record };
}

/** The first action of a plan (its first step). */
export const firstAction = (p: Planned): Action => (p.plan.steps[0] as PlanStep).action;

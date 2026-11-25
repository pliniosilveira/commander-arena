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
import type { Action, GameView, PendingDecision } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';
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
import { scenariosOf } from './heuristic-threats';

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

/** What one planning did, for the measurements of the pull request and the tests. */
export interface PlanRecord {
  readonly lines: number;
  readonly scored: number;
  readonly scenarios: number;
  readonly chosen: string;
  /** The value of today's line and of the chosen one. */
  readonly today: number;
  readonly value: number;
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

/**
 * Scores `lines` (today's first) for the decision of `view` in window `now` and returns the plan of the
 * chosen one, or null when today's line could not be scored (no sample, a refused play-out, no time).
 */
export function choosePlan(
  view: GameView,
  now: Window,
  lines: readonly Line[],
  think: Think,
  agents: SimAgents,
): Planned | null {
  const me = view.viewer;
  const sample = think.sample();
  if (sample === undefined || sample.pending?.kind !== 'priority' || sample.pending.seat !== me) {
    return null;
  }
  const weights = think.weights;
  const all = scenariosOf(view, sample, weights);
  // With more than one opponent every opponent's turn is played out: fewer scenarios.
  const scenarios = view.seats.length > 2 ? all.slice(0, 2) : all;
  const ctx = { agents, budget: think.budget, weights };
  let done = 0;
  const scored: { index: number; value: number; steps: readonly PlanStep[] }[] = [];
  outer: for (const [i, line] of lines.entries()) {
    const scores: number[] = [];
    let steps: readonly PlanStep[] = [];
    for (const [j, s] of scenarios.entries()) {
      if (i > 0 && think.budget.expired(done)) break outer;
      const result = playLine(s.state, me, line, ctx, j === 0);
      done += 1;
      if (result === null) break;
      if (j === 0) steps = result.steps;
      scores.push(evaluate(getView(result.end, me), me, weights).score);
    }
    if (scores.length < scenarios.length) {
      if (i === 0 || think.budget.over()) break;
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
  if (today === undefined) return null;
  let best = today;
  for (const s of scored) {
    if (s.index !== 0 && s.value > today.value + weights.plan.margin && s.value > best.value)
      best = s;
  }
  const first = best.steps[0];
  if (first === undefined || first.when !== now) return null;
  return {
    plan: {
      turn: view.turn,
      steps: best.steps,
      next: 1,
      line: lines[best.index]?.label ?? '?',
      score: best.value,
    },
    index: best.index,
    record: {
      lines: lines.length,
      scored: scored.length,
      scenarios: scenarios.length,
      chosen: lines[best.index]?.label ?? '?',
      today: today.value,
      value: best.value,
    },
  };
}

/** The first action of a plan (its first step). */
export const firstAction = (p: Planned): Action => (p.plan.steps[0] as PlanStep).action;

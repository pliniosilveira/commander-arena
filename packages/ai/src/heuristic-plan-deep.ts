/**
 * Selective deepening of the turn planner (issue 653, step 4). The planner plays every line to the start of
 * the agent's next turn (horizon 1). With two players, the lines that came out close to the best are played
 * on one more turn, to the start of the agent's turn after next (horizon 2, `playLine`), where the agent
 * and the opponent play the turn between by their own rules; a land, a creature or a removal spell that
 * pays off only a turn later shows then.
 *
 * Which lines: today's line and those within `plan.deepMargin` of the best value, at most `MAX_DEEP_LINES`.
 * They are played on the scenarios of the planning in order, base first, as a sequential halving: after each
 * scenario but the last the worse half of the lines (by their mean so far) is dropped, today's line never, so
 * the likeliest scenario is paid for by every candidate and the rarer ones only by the survivors. The deeper
 * value of a survivor is its scenarios' value the same way as at horizon 1 (`lineValue`); a line's value is
 * `(1 - plan.deepBlend) * v1 + plan.deepBlend * v2`.
 *
 * It runs only when the work left covers one deep play-out (`DEEP_COST` times what a play-out of the
 * planning cost so far on average), on the stretched bounds of the deepening phase (`Budget.deep`), and
 * gives up with nothing (the planning keeps its horizon 1 choice) when any play-out of today's line is cut
 * or refused. Two players only: with more, the planner looks at two scenarios only and one turn of each
 * opponent already costs what the budget allows.
 */
import type { SeatId } from '@commander-arena/engine';
import { evaluate } from './evaluate';
import type { Budget } from './heuristic-budget';
import { type Line, type PlanStep, type PlayContext, playLine } from './heuristic-plan-sim';
import type { PlanCounter } from './heuristic-plan-work';
import type { Scenario } from './heuristic-threats';
import type { AgentWeights } from './weights';

/** The most lines played deeper (a bound of the search, not a weight). */
export const MAX_DEEP_LINES = 5;

/** The most deep play-outs of one planning (a bound of the search, not a weight). */
export const MAX_DEEP_PLAY_OUTS = 30;

/**
 * What a deep play-out is expected to cost, in play-outs of horizon 1 (a bound of the search, not a weight): it
 * goes through one more turn of each seat, but what it shares with the horizon 1 play-out of the same line is
 * kept (`PlanCounter`) and costs nothing. Measured in the pull request of step 4.
 */
export const DEEP_COST = 2;

/** One line scored at horizon 1: its value and the steps of its base play-out. */
export interface Scored {
  readonly index: number;
  readonly value: number;
  readonly steps: readonly PlanStep[];
}

/** A line's value: the scenarios' weighted mean less `riskAversion` times its gap to the worst scenario. */
export function lineValue(
  scores: readonly number[],
  scenarios: readonly Scenario[],
  riskAversion: number,
): number {
  const total = scenarios.reduce((sum, s) => sum + s.weight, 0);
  const mean =
    total === 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : scenarios.reduce((sum, s, j) => sum + s.weight * (scores[j] ?? 0), 0) / total;
  return mean - riskAversion * (mean - Math.min(...scores));
}

/** The weighted mean of the first `scores.length` scenarios (the ranking of the halving). */
function meanSoFar(scores: readonly number[], scenarios: readonly Scenario[]): number {
  let weight = 0;
  let sum = 0;
  for (const [j, score] of scores.entries()) {
    weight += scenarios[j]?.weight ?? 0;
    sum += (scenarios[j]?.weight ?? 0) * score;
  }
  return weight === 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : sum / weight;
}

export interface Deepening {
  readonly budget: Budget;
  readonly me: SeatId;
  readonly lines: readonly Line[];
  readonly scored: readonly Scored[];
  readonly scenarios: readonly Scenario[];
  readonly ctx: PlayContext;
  readonly weights: AgentWeights;
  readonly work: PlanCounter;
  /** The work units a play-out of the planning cost so far, on average. */
  readonly perPlayOut: number;
}

/** The lines to play deeper: today's and those within `plan.deepMargin` of the best, best first. */
export function deepCandidates(scored: readonly Scored[], weights: AgentWeights): Scored[] {
  const best = Math.max(...scored.map((s) => s.value));
  const near = scored
    .filter((s) => s.index !== 0 && s.value >= best - weights.plan.deepMargin)
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .slice(0, MAX_DEEP_LINES - 1);
  const today = scored.find((s) => s.index === 0);
  return today === undefined ? [] : [today, ...near];
}

/**
 * The blended value of each line that was played deeper on every scenario, by line index, or null when
 * the deepening did not run or did not finish for today's line (the planning then keeps its horizon 1 choice).
 */
export function deepen(d: Deepening): Map<number, number> | null {
  const { scenarios, weights, work } = d;
  if (weights.plan.deepBlend <= 0 || scenarios.length === 0) return null;
  const cands = deepCandidates(d.scored, weights);
  if (cands.length < 2) return null;
  // The work left must cover one deep play-out; if it does not the planning stays as it is.
  if (d.budget.left() < DEEP_COST * d.perPlayOut) return null;
  const startUnits = d.budget.used();
  const ctx: PlayContext = { ...d.ctx, budget: d.budget };
  const search = d.budget.search();
  const open = new Map<number, number[]>(cands.map((c) => [c.index, []]));
  let alive = cands.map((c) => c.index);
  try {
    for (const [j, s] of scenarios.entries()) {
      for (const index of [...alive]) {
        const why = search.expired(work.deepPlayOuts);
        if (why !== null || work.deepPlayOuts >= MAX_DEEP_PLAY_OUTS) {
          work.stop(why ?? 'work');
          return null;
        }
        const line = d.lines[index] as Line;
        const played = playLine(s.state, d.me, line, ctx, false, 2);
        work.deepPlayOuts += 1;
        if (played === null) {
          // A play-out dropped by the budget ends the deepening; one the engine refused drops its line.
          if (d.budget.over() !== null || index === 0) return null;
          alive = alive.filter((i) => i !== index);
          open.delete(index);
          continue;
        }
        open.get(index)?.push(evaluate(work.view(played.end, d.me), d.me, weights).score);
      }
      if (j < scenarios.length - 1) alive = halve(alive, open, scenarios);
    }
  } finally {
    work.deepUnits += d.budget.used() - startUnits;
  }
  const out = new Map<number, number>();
  for (const c of cands) {
    const scores = open.get(c.index);
    if (scores === undefined || scores.length < scenarios.length) continue;
    const deeper = lineValue(scores, scenarios, weights.plan.riskAversion);
    out.set(c.index, (1 - weights.plan.deepBlend) * c.value + weights.plan.deepBlend * deeper);
  }
  return out.has(0) ? out : null;
}

/** The better half of `alive` by mean so far (at least two lines stay), today's line (0) always. */
function halve(
  alive: readonly number[],
  open: ReadonlyMap<number, number[]>,
  scenarios: readonly Scenario[],
): number[] {
  if (alive.length <= 2) return [...alive];
  const rank = (i: number): number => meanSoFar(open.get(i) ?? [0], scenarios);
  const keep = Math.max(2, Math.ceil(alive.length / 2));
  const kept = [...alive].sort((a, b) => rank(b) - rank(a) || a - b).slice(0, keep);
  if (!kept.includes(0)) kept[keep - 1] = 0;
  return kept;
}

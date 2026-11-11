/**
 * HeuristicAgent blocks (M7c, PRIOR_ART 7.2 heuristics 2 and 3, D-163). The candidate plans come from
 * `heuristic-blockplan.ts`; each is declared on a copy of the sample, the engine plays the combat out
 * (`heuristic-sim.ts`) and the position that results is scored with `evaluate` from the agent's seat.
 * The best plan wins. Ties go to the plan with fewer blockers, then to the lower tier, so a block must
 * be worth something to be made.
 *
 * Without a sample, or when the copy cannot be played, the answer is `defaultPlan` (the tiers with the
 * chump fill), which needs the view alone. The block tax of CR 509.1d is applied before a candidate is
 * simulated (`withinBlockBudget`), so a declaration that cannot be paid for is never asked.
 */
import {
  type Action,
  type DeclareBlockersDecision,
  type GameState,
  getView,
  type ObjectId,
  type SeatId,
} from '@commander-arena/engine';
import { evaluate } from './evaluate';
import { type BlockPlan, blockPlans, defaultPlan } from './heuristic-blockplan';
import type { Budget } from './heuristic-budget';
import { applyOrNull, playOut, type SimPolicy } from './heuristic-sim';
import { withinBlockBudget } from './legal';
import type { Reason } from './reasons';

export interface BlockChoice {
  readonly action: Action;
  readonly reason: Reason;
}

/** What the block choice needs: the budget of the decision and the sample (if any). */
export interface BlockContext {
  readonly budget: Budget;
  readonly sample: GameState | undefined;
}

/** A block must beat not blocking by this much (score points) to be made. */
const BLOCK_MARGIN = 0.05;

const KIND_REASON: Readonly<Record<BlockPlan['kind'], Reason>> = {
  'no-block': 'no-block',
  'good-block': 'good-block',
  'trade-block': 'trade-block',
  'gang-block': 'gang-block',
  'chump-danger': 'chump-danger',
};

const asChoice = (d: DeclareBlockersDecision, plan: BlockPlan): BlockChoice => {
  const blocks = withinBlockBudget(d, plan.blocks);
  return {
    action: { kind: 'declareBlockers', blocks },
    reason: blocks.length === 0 ? 'no-block' : KIND_REASON[plan.kind],
  };
};

/** The state at the end of combat after `seat` declares `blocks` on the sample, or null when the copy cannot be played. */
export function simulateBlocks(
  sample: GameState,
  seat: SeatId,
  blocks: readonly { blocker: ObjectId; attacker: ObjectId }[],
  policy: SimPolicy = {},
): GameState | null {
  const declared = applyOrNull(sample, seat, { kind: 'declareBlockers', blocks });
  return declared === null ? null : playOut(declared, seat, policy);
}

/** The score of declaring `blocks` on the sample (`evaluate` from `seat` after the combat), or null. */
export function scoreBlocks(
  sample: GameState,
  seat: SeatId,
  blocks: readonly { blocker: ObjectId; attacker: ObjectId }[],
  policy: SimPolicy = {},
): number | null {
  const end = simulateBlocks(sample, seat, blocks, policy);
  return end === null ? null : evaluate(getView(end, seat), seat).score;
}

export function chooseHeuristicBlocks(
  view: Parameters<typeof blockPlans>[0],
  d: DeclareBlockersDecision,
  ctx: BlockContext,
): BlockChoice {
  const fallback = defaultPlan(view, d);
  const sample = ctx.sample;
  if (sample === undefined || sample.pending?.kind !== 'declareBlockers') {
    return asChoice(d, fallback);
  }
  const seat = view.viewer;
  // Trim to what can be paid for first; plans that become the same declaration are scored once.
  const seen = new Set<string>();
  const trimmed: BlockPlan[] = [];
  for (const plan of blockPlans(view, d)) {
    const blocks = withinBlockBudget(d, plan.blocks);
    const k = JSON.stringify(blocks.map((b) => [b.blocker, b.attacker]).sort());
    if (seen.has(k)) continue;
    seen.add(k);
    trimmed.push({ kind: blocks.length === 0 ? 'no-block' : plan.kind, blocks });
  }
  const dflt = trimmed.find((p) => JSON.stringify(p.blocks) === JSON.stringify(fallback.blocks));
  const ordered = [
    ...trimmed.filter((p) => p.kind === 'no-block'),
    ...(dflt === undefined || dflt.kind === 'no-block' ? [] : [dflt]),
    ...trimmed.filter((p) => p.kind !== 'no-block' && p !== dflt),
  ];
  const scored: { plan: BlockPlan; score: number }[] = [];
  for (const plan of ordered) {
    // Always look at the first two (no block and the default); the rest only while time is left.
    if (scored.length >= 2 && ctx.budget.expired(scored.length)) break;
    const score = scoreBlocks(sample, seat, plan.blocks, { abort: ctx.budget.over });
    if (score !== null) scored.push({ plan, score });
  }
  // No candidate, or fewer than the two that are always compared because a play-out ran out of time:
  // the rules-based plan answers (it handles danger and lethal on its own).
  if (scored.length === 0 || (scored.length < 2 && ctx.budget.over())) {
    return asChoice(d, fallback);
  }
  const baseline = scored.find((s) => s.plan.kind === 'no-block');
  scored.sort(
    (x, y) =>
      y.score - x.score ||
      x.plan.blocks.length - y.plan.blocks.length ||
      (x.plan.kind < y.plan.kind ? -1 : 1),
  );
  const pick = scored[0];
  if (pick === undefined) return asChoice(d, fallback);
  // A block is made only when it beats not blocking by the margin.
  const chosen =
    baseline !== undefined &&
    pick.plan !== baseline.plan &&
    pick.score < baseline.score + BLOCK_MARGIN
      ? baseline
      : pick;
  return asChoice(d, chosen.plan);
}

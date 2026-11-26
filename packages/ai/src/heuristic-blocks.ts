/**
 * HeuristicAgent blocks (M7c, PRIOR_ART 7.2 heuristics 2 and 3, D-163). The candidate plans come from
 * `heuristic-blockplan.ts`; each is declared on a copy of the sample, the engine plays the combat out
 * (`heuristic-sim.ts`) and the position that results is scored with `evaluate` from the agent's seat.
 * The best plan wins. Ties go to the plan with fewer blockers, then to the lower tier, so a block must
 * be worth something to be made.
 *
 * With two players the best of them (and no block) are then played on to the start of the agent's next turn
 * (`heuristic-combat-look.ts`, issue 653 step 5) and chosen again by that position; the score of the combat alone
 * is the answer when the work budget cannot pay for it.
 *
 * Without a sample, or when the copy cannot be played, the answer is `defaultPlan` (the tiers with the
 * chump fill), which needs the view alone. The block tax of CR 509.1d is applied before a candidate is
 * simulated (`withinBlockBudget`), so a declaration that cannot be paid for is never asked.
 */
import type {
  Action,
  DeclareBlockersDecision,
  GameState,
  ObjectId,
  SeatId,
} from '@commander-arena/engine';
import { evaluate } from './evaluate';
import { type BlockPlan, blockPlans, defaultPlan } from './heuristic-blockplan';
import type { Budget } from './heuristic-budget';
import { Look, type LookRecord, lookSet, twoPlayers } from './heuristic-combat-look';
import type { SimAgents } from './heuristic-plan-sim';
import { applyOrNull, playOut, type SimPolicy, within } from './heuristic-sim';
import { withinBlockBudget } from './legal';
import type { Reason } from './reasons';
import type { AgentWeights } from './weights';

export interface BlockChoice {
  readonly action: Action;
  readonly reason: Reason;
  /** What the look-ahead did, when it ran. */
  readonly look?: LookRecord;
}

/** What the block choice needs: the budget of the decision, the sample (if any) and the weights. */
export interface BlockContext {
  readonly budget: Budget;
  readonly sample: GameState | undefined;
  readonly weights: AgentWeights;
  /** The inner agents of the combat look-ahead (`heuristic-combat-look.ts`); without them there is none. */
  readonly agents?: SimAgents;
}

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
  const declared = applyOrNull(sample, seat, { kind: 'declareBlockers', blocks }, policy.engine);
  return declared === null ? null : playOut(declared, seat, policy);
}

export function chooseHeuristicBlocks(
  view: Parameters<typeof blockPlans>[0],
  d: DeclareBlockersDecision,
  ctx: BlockContext,
): BlockChoice {
  const fallback = defaultPlan(view, d, ctx.weights, true);
  const sample = ctx.sample;
  if (sample === undefined || sample.pending?.kind !== 'declareBlockers') {
    return asChoice(d, fallback);
  }
  const seat = view.viewer;
  // Trim to what can be paid for first; plans that become the same declaration are scored once.
  const seen = new Set<string>();
  const trimmed: BlockPlan[] = [];
  for (const plan of blockPlans(view, d, ctx.weights)) {
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
  const scored: { plan: BlockPlan; score: number; end: GameState }[] = [];
  const search = ctx.budget.search();
  const engine = ctx.budget.engine;
  for (const plan of ordered) {
    // Always look at the first two (no block and the default); the rest only while the budget lasts.
    if (scored.length >= 2 && search.expired(scored.length) !== null) break;
    const end = simulateBlocks(sample, seat, plan.blocks, within(ctx.budget));
    if (end !== null) {
      scored.push({ plan, score: evaluate(engine.view(end, seat), seat, ctx.weights).score, end });
    }
  }
  // No candidate, or fewer than the two that are always compared because a play-out was dropped:
  // the rules-based plan answers (it handles danger and lethal on its own).
  if (scored.length === 0 || (scored.length < 2 && ctx.budget.over() !== null)) {
    return asChoice(d, fallback);
  }
  type Entry = (typeof scored)[number];
  /** The best of `pool` (no block unless another beats it by the margin; ties to fewer blockers, then the lower tier). */
  const choose = (pool: readonly Entry[]): Entry | undefined => {
    const baseline = pool.find((s) => s.plan.kind === 'no-block');
    const sorted = [...pool].sort(
      (x, y) =>
        y.score - x.score ||
        x.plan.blocks.length - y.plan.blocks.length ||
        (x.plan.kind < y.plan.kind ? -1 : 1),
    );
    const pick = sorted[0];
    if (pick === undefined) return undefined;
    // A block is made only when it beats not blocking by the margin.
    return baseline !== undefined &&
      pick.plan !== baseline.plan &&
      pick.score < baseline.score + ctx.weights.blocks.margin
      ? baseline
      : pick;
  };
  const first = choose(scored);
  if (first === undefined) return asChoice(d, fallback);
  // The look-ahead (two players): "no block" and the best other plans, played to the agent's next turn
  // (`heuristic-combat-look.ts`), and chosen among by what the board is worth then.
  const baseline = scored.find((s) => s.plan.kind === 'no-block');
  const agents = ctx.agents;
  if (agents !== undefined && baseline !== undefined && twoPlayers(view)) {
    const look = new Look(seat, agents, ctx.budget, ctx.weights);
    const ranked = [...scored].sort((x, y) => y.score - x.score);
    const set = lookSet(ranked, baseline, (e) => e.score, ctx.weights.blocks.lookMargin);
    const lookSearch = ctx.budget.search();
    const looked: Entry[] = [];
    for (const e of [...new Set([first, baseline, ...set])]) {
      if (lookSearch.expired(look.playOuts) !== null) break;
      const next = look.next(e.end);
      if (next !== null) looked.push({ ...e, score: look.score(next) });
    }
    const second = looked.some((e) => e.plan === baseline.plan) ? choose(looked) : undefined;
    if (second !== undefined && looked.length >= 2) {
      return {
        ...asChoice(d, second.plan),
        look: { playOuts: look.playOuts, changed: second.plan !== first.plan },
      };
    }
  }
  return asChoice(d, first.plan);
}

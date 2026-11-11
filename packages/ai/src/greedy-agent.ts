/**
 * GreedyAgent (M7b, SPEC 17.3 A11, D-011, D-162): the benchmark opponent of the M7 exit criterion.
 *
 * - Plays a land every turn it can.
 * - Casts the most expensive spell it can cast, over and over until nothing more is castable: each
 *   priority decision lists only what the mana left can pay for, so "dearest first" fills the turn
 *   greedily. "Most expensive" is the mana the cast spends now (reductions and commander tax counted),
 *   then the printed mana value, then its PRNG. It does not search for the set of spells that uses the
 *   most mana (that is a HeuristicAgent idea, PRIOR_ART 7.2 heuristic 8). Spells that are pointless
 *   without a target are skipped exactly as the CasualAgent skips them (`worthCasting`), because a cast
 *   cannot be taken back once it has started.
 * - Attacks with every creature that survives the attack, or with everything when that is lethal;
 *   blocks only to prevent lethal damage (`greedy-combat.ts` has the exact rules).
 * - Never activates an ability but the loyalty ability of a planeswalker of its own (D-203), never concedes, pays with `payAuto`.
 *
 * Every other decision kind is answered by the CasualAgent handlers (`createCasualHandlers`), so the
 * agent handles every kind and cannot deadlock. It has its own seeded PRNG for tie-breaks and records
 * a fallback, like the CasualAgent, if a handler throws. It also records the reason of each decision
 * (`reasons.ts`).
 */
import {
  type Action,
  createRng,
  type DecisionHandlers,
  type GameView,
  handleDecision,
  nextInt,
  type PendingDecision,
  type PriorityDecision,
  type RngState,
} from '@commander-arena/engine';
import type { DecideContext, FallbackRecord } from './agent';
import { createCasualHandlers } from './casual-agent';
import { chooseLoyaltyActivation } from './casual-loyalty';
import { isPreventionSpell, preventionKey } from './casual-prevention';
import { chooseLand, landPlays, type Play, spellPlays, spendOf, withFace } from './casual-priority';
import { manaValueOf } from './casual-view';
import { chooseGreedyAttack, chooseGreedyBlocks } from './greedy-combat';
import { firstSafeAction } from './legal';
import { type ExplainingAgent, type Reason, type ReasonRecord, summarizeAction } from './reasons';

export interface GreedyAgentOptions {
  readonly seed: number;
  readonly name?: string;
  /** Test seam, as on the CasualAgent: handlers that replace the defaults for the listed kinds. */
  readonly handlerOverrides?: Partial<DecisionHandlers<Action>>;
}

const castAction = (p: Play): Action => ({
  kind: 'castSpell',
  object: p.obj.id,
  ...(p.free === true ? { alternative: 'free' as const } : {}),
  ...(p.alt === undefined ? {} : { alternative: p.alt }),
  ...withFace(p.face),
});

/** Land, else the most expensive castable spell, else pass. */
function choosePriority(
  view: GameView,
  d: PriorityDecision,
  draw: (n: number) => number,
  activations: Set<string>,
): { action: Action; reason: Reason } {
  const land = chooseLand(landPlays(view, d), draw);
  if (land !== undefined) {
    return {
      action: { kind: 'playLand', object: land.obj.id, ...withFace(land.face) },
      reason: 'land',
    };
  }
  const spells = spellPlays(view, d, activations);
  if (spells.length > 0) {
    const top = Math.max(...spells.map(spendOf));
    const dearest = spells.filter((s) => spendOf(s) === top);
    const value = Math.max(...dearest.map((s) => manaValueOf(s.obj)));
    const tied = dearest.filter((s) => manaValueOf(s.obj) === value);
    const chosen = tied[draw(tied.length)];
    if (chosen !== undefined) {
      if (isPreventionSpell(chosen.obj)) activations.add(preventionKey(view));
      return { action: castAction(chosen), reason: 'curve' };
    }
  }
  // A planeswalker of ours is used once a turn after the spells (D-203, CR 606; the only ability it uses).
  const loyalty = chooseLoyaltyActivation(view, d);
  if (loyalty !== null) return { action: loyalty, reason: 'loyalty' };
  return { action: { kind: 'pass' }, reason: 'no-play' };
}

export class GreedyAgent implements ExplainingAgent {
  readonly name: string;
  private rng: RngState;
  private readonly overrides: Partial<DecisionHandlers<Action>>;
  private readonly fallbackList: FallbackRecord[] = [];
  private readonly reasonList: ReasonRecord[] = [];
  /** Prevention spells cast in the window they were cast in (casual-prevention.ts). */
  private readonly activations = new Set<string>();

  constructor(options: GreedyAgentOptions) {
    this.name = options.name ?? `greedy#${options.seed}`;
    this.rng = createRng(options.seed);
    this.overrides = options.handlerOverrides ?? {};
  }

  get fallbacks(): readonly FallbackRecord[] {
    return this.fallbackList;
  }

  get reasons(): readonly ReasonRecord[] {
    return this.reasonList;
  }

  private draw(maxExclusive: number): number {
    const [value, next] = nextInt(this.rng, maxExclusive);
    this.rng = next;
    return value;
  }

  /**
   * The handler per decision kind: the casual ones, with priority, attackers and blockers replaced.
   * `note` receives the reason of the answer those three give.
   */
  decisionHandlers(
    view: GameView,
    note: (reason: Reason) => void = () => undefined,
  ): DecisionHandlers<Action> {
    const draw = (n: number) => this.draw(n);
    return {
      ...createCasualHandlers(view, draw, this.activations),
      priority: (d) => {
        const { action, reason } = choosePriority(view, d, draw, this.activations);
        note(reason);
        return action;
      },
      declareAttackers: (d) => {
        const { action, reason } = chooseGreedyAttack(view, d);
        note(reason);
        return action;
      },
      declareBlockers: (d) => {
        const { action, reason } = chooseGreedyBlocks(view, d);
        note(reason);
        return action;
      },
      ...this.overrides,
    };
  }

  decide(view: GameView, decision: PendingDecision, _ctx: DecideContext): Promise<Action> {
    let reason: Reason = 'delegated';
    try {
      const action = handleDecision(
        decision,
        this.decisionHandlers(view, (r) => {
          reason = r;
        }),
      );
      this.reasonList.push({
        decisionKind: decision.kind,
        action: summarizeAction(view, action),
        reason,
      });
      return Promise.resolve(action);
    } catch (error) {
      this.fallbackList.push({
        decisionKind: decision.kind,
        message: error instanceof Error ? error.message : String(error),
      });
      const action = firstSafeAction(decision);
      this.reasonList.push({
        decisionKind: decision.kind,
        action: summarizeAction(view, action),
        reason: 'delegated',
      });
      return Promise.resolve(action);
    }
  }
}

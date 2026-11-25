/**
 * HeuristicAgent (M7c, SPEC 9, A10, A11, A31, D-163): the opponent. It plays combat by playing
 * candidate blocks and attacks out on a determinized sample of the game with the engine and scoring the
 * result with the evaluator, plans its mana (the set of spells that uses the most, the land that lets
 * the best of them be cast), aims removal with "do not waste it" filters, holds instant-speed plays for
 * a named window, and keeps or sends back its opening hand by land count and curve. Every decision kind
 * it does not take over is answered by the casual handlers (`createCasualHandlers`), so it handles every
 * kind and cannot deadlock. The module comments of the `heuristic-*.ts` files hold the rules.
 *
 * - Its main phase goes through the turn planner (`heuristic-plan.ts`, issue 624): at the first priority
 *   decision of a main phase it scores candidate lines of the whole turn on threat scenarios and follows
 *   the chosen plan while the board is the one it expected (reasons `plan` and `replan`); today's choice
 *   (`heuristic-main.ts`) is one of the lines and the answer whenever planning cannot run.
 * - It considers every candidate its generators produce (the Easy level of D-163 was removed, D-168).
 * - It owns a seeded PRNG (`seed`): tie-breaks of the casual handlers and the seeds of the samples. The
 *   game's PRNG is never read.
 * - Its searches are bounded by work, not time: every search of a decision draws from one budget of engine
 *   work and takes the best candidate so far when it runs out, so a decision is the same on any device
 *   (`heuristic-budget.ts`). It never reads a clock: `ctx.now` and `ctx.budgetMs` are only a safety cutoff
 *   (a search starts nothing past 60% of the time budget).
 * - Its tunable numbers (evaluator constants, margins, thresholds) come from `weights` (`weights.ts`),
 *   `DEFAULT_WEIGHTS` when none are given, and are handed down to every heuristic through `Think` or the
 *   combat contexts; nothing is read from module state.
 * - A throwing handler falls back to the first safe legal action and is recorded, as on the
 *   CasualAgent; every decision is recorded with its reason (`reasons.ts`).
 */
import {
  type Action,
  createRng,
  type DecisionHandlers,
  type GameState,
  type GameView,
  handleDecision,
  nextInt,
  type PendingDecision,
  type PriorityDecision,
  type RngState,
  type SeatId,
} from '@commander-arena/engine';
import type { DecideContext, FallbackRecord } from './agent';
import { createCasualHandlers } from './casual-agent';
import { isHelpfulSpell } from './casual-helpful';
import { noteCast, withoutTriedCasts } from './casual-no-target';
import { chooseRingBearerWithEvasion } from './casual-ring';
import { findObject } from './casual-view';
import { chooseHeuristicAttack } from './heuristic-attacks';
import { chooseHeuristicBlocks } from './heuristic-blocks';
import {
  type Budget,
  NO_BUDGET,
  type SearchWork,
  startBudget,
  type Think,
} from './heuristic-budget';
import { choosePriorityHeuristic, type PriorityChoice } from './heuristic-main';
import { OpponentModel } from './heuristic-model';
import { chooseHeuristicMulligan } from './heuristic-mulligan';
import {
  choosePlan,
  firstAction,
  followPlan,
  type PlanRecord,
  type TurnPlan,
} from './heuristic-plan';
import { mainLines, ownActivations, windowLines } from './heuristic-plan-lines';
import { type SimAgents, type Window, windowOf } from './heuristic-plan-sim';
import type { PlanWork } from './heuristic-plan-work';
import { isProtectionSpell, payHolding, protectedTarget } from './heuristic-protect';
import { chooseReplacementByOutcome } from './heuristic-replacement';
import { chooseRemovalTargets, creatureToHelp } from './heuristic-targets';
import { chooseVoteByOutcome } from './heuristic-vote';
import { firstSafeAction } from './legal';
import { MIN_KEEP_SIZE } from './random-agent';
import { type ExplainingAgent, type Reason, type ReasonRecord, summarizeAction } from './reasons';
import { type AgentWeights, DEFAULT_WEIGHTS } from './weights';

/** The most plannings in one turn: the first plan, and replans after surprises (a bound, not a weight). */
const MAX_PLANS_PER_TURN = 4;

export interface HeuristicAgentOptions {
  readonly seed: number;
  readonly name?: string;
  /** Test seam, as on the CasualAgent: handlers that replace the defaults for the listed kinds. */
  readonly handlerOverrides?: Partial<DecisionHandlers<Action>>;
  /** The tunable numbers of the agent (`weights.ts`); `DEFAULT_WEIGHTS` when left out. */
  readonly weights?: AgentWeights;
}

export class HeuristicAgent implements ExplainingAgent {
  readonly name: string;
  private rng: RngState;
  private readonly overrides: Partial<DecisionHandlers<Action>>;
  readonly weights: AgentWeights;
  private readonly fallbackList: FallbackRecord[] = [];
  private readonly reasonList: ReasonRecord[] = [];
  /** Prevention spells cast in the window they were cast in (casual-prevention.ts). */
  private readonly activations = new Set<string>();
  /** The mana the payment of the cast just chosen keeps open for a protection spell (`heuristic-protect.ts`). */
  private reserve: readonly string[] | null = null;
  /** How the opponent has blocked (heuristic-model.ts). */
  readonly opponent: OpponentModel;
  /** The plan of the turn (`heuristic-plan.ts`); its end-step steps last into the opponents' turns. */
  private plan: TurnPlan | null = null;
  private readonly planList: PlanRecord[] = [];
  private readonly workList: PlanWork[] = [];
  private readonly searchList: SearchWork[] = [];
  /** The budget of the decision being answered (`decide`), read once it is answered. */
  private budget: Budget = NO_BUDGET;
  /** The plannings tried this turn (see `priorityChoice`). */
  private tries: { turn: number; count: number; failed: Set<Window> } = {
    turn: -1,
    count: 0,
    failed: new Set(),
  };

  constructor(options: HeuristicAgentOptions) {
    this.name = options.name ?? `heuristic#${options.seed}`;
    this.rng = createRng(options.seed);
    this.overrides = options.handlerOverrides ?? {};
    this.weights = options.weights ?? DEFAULT_WEIGHTS;
    this.opponent = new OpponentModel(this.weights);
  }

  get fallbacks(): readonly FallbackRecord[] {
    return this.fallbackList;
  }

  get reasons(): readonly ReasonRecord[] {
    return this.reasonList;
  }

  /** Every planning the agent did, oldest first (lines, scenarios, the line chosen). */
  get plans(): readonly PlanRecord[] {
    return this.planList;
  }

  /** What every planning cost, oldest first: the ones that ended in a plan and the ones that did not. */
  get plannings(): readonly PlanWork[] {
    return this.workList;
  }

  /** What every decision that searched cost (engine calls, work units, what cut it), oldest first. */
  get searches(): readonly SearchWork[] {
    return this.searchList;
  }

  /** Inner agents for the planner's play-outs: the same rules and weights, no sample, so no planning. */
  private readonly simAgents: SimAgents = {
    start: () => {
      const agents = new Map<SeatId, HeuristicAgent>();
      return (seat) => {
        let agent = agents.get(seat);
        if (agent === undefined) {
          agent = new HeuristicAgent({ seed: 7919 + seat, weights: this.weights });
          agents.set(seat, agent);
        }
        const inner = agent;
        return (view) => inner.decisionHandlers(view);
      };
    },
  };

  /**
   * The priority choice: a step of the plan, a new plan, or today's choice (see `heuristic-plan.ts`).
   * `planning` is false without a sample (the inner agents of a play-out, a host that gives none).
   */
  private priorityChoice(
    view: GameView,
    d: PriorityDecision,
    think: Think,
    answer: (v: GameView, pending: PendingDecision) => Action,
    planning: boolean,
  ): PriorityChoice {
    if (this.plan !== null && view.activeSeat === view.viewer && view.turn > this.plan.turn) {
      this.plan = null;
    }
    const when = planning ? windowOf(view, d) : null;
    if (when !== null) {
      const step = followPlan(this.plan, view, d, when);
      if (step !== null) {
        return {
          action: step.action,
          reason: 'plan',
          ...(step.reserve === null ? {} : { reserve: step.reserve }),
        };
      }
    }
    const today = choosePriorityHeuristic(view, d, think, this.activations, answer);
    if (when === null || when === 'attack') return today;
    let lines: ReturnType<typeof mainLines>;
    if (when === 'main1' || when === 'main2') {
      if (today.action.kind === 'playLand') return today;
      lines = mainLines(view, d, when, today, this.activations, this.weights);
    } else {
      const quiet = today.action.kind === 'pass' || today.action.kind === 'activate';
      if (!quiet || ownActivations(view, d).length === 0) return today;
      lines = windowLines(view, d, when, today.action);
    }
    if (lines.length < 2) return today;
    // At most MAX_PLANS_PER_TURN plannings a turn, and none again in a window where one failed (no time,
    // a refused play-out): on a huge board every decision of the window would otherwise use the budget.
    if (this.tries.turn !== view.turn)
      this.tries = { turn: view.turn, count: 0, failed: new Set() };
    if (this.tries.count >= MAX_PLANS_PER_TURN || this.tries.failed.has(when)) return today;
    this.tries.count += 1;
    const { planned, work } = choosePlan(view, when, lines, think, this.simAgents);
    this.workList.push(work);
    if (planned === null) {
      this.tries.failed.add(when);
      return today;
    }
    const replan = this.plan !== null;
    this.plan = planned.plan;
    this.planList.push(planned.record);
    if (planned.index === 0) return replan ? { ...today, reason: 'replan' } : today;
    const reserve = planned.plan.steps[0]?.reserve ?? null;
    return {
      action: firstAction(planned),
      reason: replan ? 'replan' : 'plan',
      ...(reserve === null ? {} : { reserve }),
    };
  }

  private draw(maxExclusive: number): number {
    const [value, next] = nextInt(this.rng, maxExclusive);
    this.rng = next;
    return value;
  }

  /** What a decision may think with, for a context (the sample is built at most once). */
  private think(ctx: DecideContext | undefined): Think {
    let sample: GameState | undefined;
    let built = false;
    const budget = ctx === undefined ? NO_BUDGET : startBudget(ctx);
    if (ctx !== undefined) this.budget = budget;
    return {
      budget,
      weights: this.weights,
      draw: (n) => this.draw(n),
      sample: () => {
        if (!built) {
          built = true;
          sample = ctx?.sample?.(this.draw(0x7fffffff));
        }
        return sample;
      },
    };
  }

  /** The handler per decision kind: the casual ones, with the decisions this agent plays itself replaced. */
  decisionHandlers(
    view: GameView,
    note: (reason: Reason) => void = () => undefined,
    ctx?: DecideContext,
  ): DecisionHandlers<Action> {
    const think = this.think(ctx);
    const casual = createCasualHandlers(view, think.draw, this.activations);
    // What a simulated cast asks after the cast has started (targets, payment): the same handlers.
    const answer = (v: GameView, pending: PendingDecision): Action =>
      handleDecision(pending, this.decisionHandlers(v));
    return {
      ...casual,
      priority: (d) => {
        this.opponent.observe(view);
        this.reserve = null;
        const open = withoutTriedCasts(view, d, this.activations);
        const choice = this.priorityChoice(view, open, think, answer, ctx?.sample !== undefined);
        noteCast(view, choice.action, this.activations);
        this.reserve = choice.action.kind === 'castSpell' ? (choice.reserve ?? null) : null;
        note(choice.reason);
        return choice.action;
      },
      payMana: (d) => {
        const hold = this.reserve;
        this.reserve = null;
        return (hold === null ? null : payHolding(view, d, hold)) ?? casual.payMana(d);
      },
      mulligan: (d) => {
        const choice = chooseHeuristicMulligan(view, d, MIN_KEEP_SIZE, this.weights);
        note(choice.reason);
        return choice.action;
      },
      targets: (d) => {
        const source = findObject(view, d.source);
        const plain = d.forTrigger !== true && d.forCopy !== true && d.forChange !== true;
        const simple = d.specs.every((s) => s.mode === undefined && s.divide === undefined);
        if (source !== undefined && plain && simple) {
          const pick = chooseRemovalTargets(view, source, d.specs, this.weights);
          if (pick !== null) {
            note(pick.reason);
            return { kind: 'chooseTargets', targets: pick.targets };
          }
          const [spec] = d.specs;
          if (
            isHelpfulSpell(source) &&
            d.specs.length === 1 &&
            spec !== undefined &&
            spec.max === 1
          ) {
            const target =
              (isProtectionSpell(source)
                ? protectedTarget(view, spec.legal, this.weights)
                : null) ?? creatureToHelp(view, spec.legal, this.weights);
            if (target !== null) return { kind: 'chooseTargets', targets: [target] };
          }
        }
        return casual.targets(d);
      },
      // The attack is not taken from the plan: the plan's play-out chose it from the view alone, and the
      // attack search on the sample (`heuristic-attacks.ts`) is the stronger rule and costs little.
      declareAttackers: (d) => {
        const choice = chooseHeuristicAttack(view, d, {
          sample: think.sample(),
          budget: think.budget,
          weights: this.weights,
          passiveWeight: this.opponent.passiveWeight,
          passiveWeightFor: (seat) => this.opponent.passiveWeightFor(seat),
        });
        note(choice.reason);
        return choice.action;
      },
      declareBlockers: (d) => {
        const choice = chooseHeuristicBlocks(view, d, {
          sample: think.sample(),
          budget: think.budget,
          weights: this.weights,
        });
        note(choice.reason);
        return choice.action;
      },
      // CR 701.54a (D-196): the Ring-bearer, the creature the designation helps most; the other permanents are chosen as the casual agent does.
      choosePermanent: (d) =>
        d.purpose === 'ringBearer'
          ? chooseRingBearerWithEvasion(view, d)
          : casual.choosePermanent(d),
      // CR 616.1 (D-191): the order of prevention effects on a damage event, chosen by what each leads to; the other options are the casual ones.
      // CR 701.38a (D-194): a vote, by playing each option out on a sample.
      chooseOption: (d) =>
        d.purpose === 'replacement'
          ? chooseReplacementByOutcome(d)
          : d.purpose === 'vote'
            ? chooseVoteByOutcome(d, think.sample(), casual.chooseOption(d), this.weights)
            : casual.chooseOption(d),
      ...this.overrides,
    };
  }

  decide(view: GameView, decision: PendingDecision, ctx: DecideContext): Promise<Action> {
    let reason: Reason = 'delegated';
    try {
      const action = handleDecision(
        decision,
        this.decisionHandlers(
          view,
          (r) => {
            reason = r;
          },
          ctx,
        ),
      );
      const budget = this.budget;
      this.budget = NO_BUDGET;
      if (budget.calls() > 0) {
        this.searchList.push({
          kind: decision.kind,
          calls: budget.calls(),
          units: budget.used(),
          cut: budget.cut(),
          // The clock as the searches last read it: one more read would make the decision longer on a host
          // whose clock moves with every read.
          ms: budget.seen(),
        });
      }
      this.reasonList.push({
        decisionKind: decision.kind,
        action: summarizeAction(view, action),
        reason,
      });
      return Promise.resolve(action);
    } catch (error) {
      this.budget = NO_BUDGET;
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

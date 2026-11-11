/**
 * HeuristicAgent (M7c, SPEC 9, A10, A11, A31, D-163): the opponent. It plays combat by playing
 * candidate blocks and attacks out on a determinized sample of the game with the engine and scoring the
 * result with the evaluator, plans its mana (the set of spells that uses the most, the land that lets
 * the best of them be cast), aims removal with "do not waste it" filters, holds instant-speed plays for
 * a named window, and keeps or sends back its opening hand by land count and curve. Every decision kind
 * it does not take over is answered by the casual handlers (`createCasualHandlers`), so it handles every
 * kind and cannot deadlock. The module comments of the `heuristic-*.ts` files hold the rules.
 *
 * - It considers every candidate its generators produce (the Easy level of D-163 was removed, D-168).
 * - It owns a seeded PRNG (`seed`): tie-breaks of the casual handlers and the seeds of the samples. The
 *   game's PRNG is never read.
 * - It never reads a clock: `ctx.now` and `ctx.budgetMs` bound a search, which stops at 60% of the budget
 *   and takes the best candidate so far (`heuristic-budget.ts`).
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
  type RngState,
} from '@commander-arena/engine';
import type { DecideContext, FallbackRecord } from './agent';
import { createCasualHandlers } from './casual-agent';
import { isHelpfulSpell } from './casual-helpful';
import { chooseRingBearerWithEvasion } from './casual-ring';
import { findObject } from './casual-view';
import { chooseHeuristicAttack } from './heuristic-attacks';
import { chooseHeuristicBlocks } from './heuristic-blocks';
import { NO_BUDGET, startBudget, type Think } from './heuristic-budget';
import { choosePriorityHeuristic } from './heuristic-main';
import { OpponentModel } from './heuristic-model';
import { chooseHeuristicMulligan } from './heuristic-mulligan';
import { chooseReplacementByOutcome } from './heuristic-replacement';
import { chooseRemovalTargets, creatureToHelp } from './heuristic-targets';
import { chooseVoteByOutcome } from './heuristic-vote';
import { firstSafeAction } from './legal';
import { MIN_KEEP_SIZE } from './random-agent';
import { type ExplainingAgent, type Reason, type ReasonRecord, summarizeAction } from './reasons';

export interface HeuristicAgentOptions {
  readonly seed: number;
  readonly name?: string;
  /** Test seam, as on the CasualAgent: handlers that replace the defaults for the listed kinds. */
  readonly handlerOverrides?: Partial<DecisionHandlers<Action>>;
}

export class HeuristicAgent implements ExplainingAgent {
  readonly name: string;
  private rng: RngState;
  private readonly overrides: Partial<DecisionHandlers<Action>>;
  private readonly fallbackList: FallbackRecord[] = [];
  private readonly reasonList: ReasonRecord[] = [];
  /** Prevention spells cast in the window they were cast in (casual-prevention.ts). */
  private readonly activations = new Set<string>();
  /** How the opponent has blocked (heuristic-model.ts). */
  readonly opponent = new OpponentModel();

  constructor(options: HeuristicAgentOptions) {
    this.name = options.name ?? `heuristic#${options.seed}`;
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

  /** What a decision may think with, for a context (the sample is built at most once). */
  private think(ctx: DecideContext | undefined): Think {
    let sample: GameState | undefined;
    let built = false;
    return {
      budget: ctx === undefined ? NO_BUDGET : startBudget(ctx),
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
        const choice = choosePriorityHeuristic(view, d, think, this.activations, answer);
        note(choice.reason);
        return choice.action;
      },
      mulligan: (d) => {
        const choice = chooseHeuristicMulligan(view, d, MIN_KEEP_SIZE);
        note(choice.reason);
        return choice.action;
      },
      targets: (d) => {
        const source = findObject(view, d.source);
        const plain = d.forTrigger !== true && d.forCopy !== true && d.forChange !== true;
        const simple = d.specs.every((s) => s.mode === undefined && s.divide === undefined);
        if (source !== undefined && plain && simple) {
          const pick = chooseRemovalTargets(view, source, d.specs);
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
            const target = creatureToHelp(view, spec.legal);
            if (target !== null) return { kind: 'chooseTargets', targets: [target] };
          }
        }
        return casual.targets(d);
      },
      declareAttackers: (d) => {
        const choice = chooseHeuristicAttack(view, d, {
          sample: think.sample(),
          budget: think.budget,
          passiveWeight: this.opponent.passiveWeight,
        });
        note(choice.reason);
        return choice.action;
      },
      declareBlockers: (d) => {
        const choice = chooseHeuristicBlocks(view, d, {
          sample: think.sample(),
          budget: think.budget,
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
            ? chooseVoteByOutcome(d, think.sample(), casual.chooseOption(d))
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

/**
 * CasualAgent (SPEC 9): a beginner opponent. It plays a land, casts its most expensive castable
 * spell, attacks when that looks safe, blocks when that looks good, and never taps mana by hand
 * (the casting flow pays with `payAuto`) or concedes. The heuristics are deliberately weak but
 * sensible; the stronger HeuristicAgent comes later. It has its own seeded PRNG for tie-breaks and
 * never throws: a failing handler falls back to the first safe legal action and the fallback is
 * recorded, exactly like RandomLegalAgent.
 */
import {
  type Action,
  createRng,
  type DecisionHandlers,
  defaultDivision,
  type GameView,
  handleDecision,
  nextInt,
  type PendingDecision,
  type RngState,
} from '@commander-arena/engine';
import type { Agent, DecideContext, FallbackRecord } from './agent';
import { chooseCardsToLose, chooseMulligan, chooseTargets } from './casual-choices';
import { chooseAttackers, chooseBlockers } from './casual-combat';
import { upkeepAnswer, wardDiscardAnswer } from './casual-costs';
import { chooseAuraHost, chooseProliferate } from './casual-counters';
import { chooseDividedTargets } from './casual-divide';
import { chooseEntersCopy } from './casual-dragons';
import { chooseFightOpponent } from './casual-free';
import { chooseDevourSacrifice } from './casual-keywords';
import { laterAnswer } from './casual-later';
import { chooseArrangement } from './casual-library';
import { chooseModalTargets, chooseModesAnswer } from './casual-modes';
import { chooseOptionAnswer } from './casual-options';
import { choosePayOptionsAnswer } from './casual-pay-options';
import {
  chooseLegendToKeep,
  choosePermanentToReturn,
  choosePermanentToSacrifice,
  choosePermanentToTap,
  chooseSparedPermanent,
  chooseUntap,
  confirmOptional,
  orderTriggersAsListed,
} from './casual-permanents';
import { choosePriorityAction, worthCasting } from './casual-priority';
import { chooseAnyNumberToSacrifice, giftAnswer } from './casual-recursion';
import { chooseNewTarget } from './casual-redirect';
import { chooseRingBearer } from './casual-ring';
import { chooseCardsFromZone } from './casual-search';
import { chooseSoulbondPartner } from './casual-soulbond';
import { chooseCrewCreatures } from './casual-vehicles';
import { chooseXAnswer, chooseXDamageTarget } from './casual-x';
import { firstSafeAction } from './legal';
import { MIN_KEEP_SIZE } from './random-agent';

export interface CasualAgentOptions {
  readonly seed: number;
  readonly name?: string;
  /**
   * Test seam: handlers that replace the defaults for the listed decision kinds. The merged map is
   * still a full `DecisionHandlers`, so a kind can never be left without a handler.
   */
  readonly handlerOverrides?: Partial<DecisionHandlers<Action>>;
}

/**
 * The handler per decision kind for one view. The record type makes a missing kind a compile
 * error. `draw(n)` gives a number in [0, n) for tie-breaks.
 */
export function createCasualHandlers(
  view: GameView,
  draw: (n: number) => number,
  activations: Set<string> = new Set(),
): DecisionHandlers<Action> {
  return {
    priority: (d) => choosePriorityAction(view, d, draw, activations),
    mulligan: (d) => chooseMulligan(view, d, MIN_KEEP_SIZE),
    mulliganBottom: (d) => chooseCardsToLose(view, d),
    // "Deals X damage" once X is known: a creature that X kills, else the opponent (casual-x.ts).
    targets: (d) => {
      // The new target of a spell or ability whose target a resolving effect changes (D-181, CR 115.7a).
      const redirected = chooseNewTarget(view, d);
      if (redirected !== null) return redirected;
      // A division announced with the targets (CR 601.2d, D-145): the shares are part of the answer.
      const divided = chooseDividedTargets(view, d);
      if (divided !== null) return divided;
      // A modal spell or ability (D-114): each slot is aimed by the text of the mode it belongs to.
      const modal = chooseModalTargets(view, d);
      if (modal !== null) return { kind: 'chooseTargets', targets: modal };
      const aimed = chooseXDamageTarget(view, d);
      return aimed === null ? chooseTargets(view, d) : { kind: 'chooseTargets', targets: aimed };
    },
    // The casting flow pays automatically, so the AI never needs to tap mana sources itself.
    payMana: () => ({ kind: 'payAuto' }),
    discard: (d) => chooseCardsToLose(view, d),
    commanderZone: () => ({ kind: 'moveToCommandZone' }),
    declareAttackers: (d) => chooseAttackers(view, d),
    declareBlockers: (d) => chooseBlockers(view, d),
    assignDamage: (d) => ({ kind: 'assignDamage', assignments: defaultDivision(d.choices) }),
    choosePermanent: (d) =>
      d.purpose === 'fight'
        ? chooseFightOpponent(view, d) // CR 701.14, D-145: the creature the subject fights
        : d.purpose === 'ringBearer'
          ? chooseRingBearer(view, d) // CR 701.54a, D-196: the creature with the most power becomes the Ring-bearer
          : d.purpose === 'untap'
            ? { kind: 'choosePermanents', objects: [...d.legal] } // CR 502.3, D-125: untap everything
            : d.purpose === 'legendRule'
              ? chooseLegendToKeep(view, d)
              : d.purpose === 'conniveOrder'
                ? { kind: 'choosePermanents', objects: d.legal.slice(0, 1) } // CR 701.50c, D-223: every permanent connives; the first listed goes first
                : d.purpose === 'entersCopy'
                  ? chooseEntersCopy(view, d) // CR 707.9, D-151: the creature an artifact enters as a copy of
                  : d.purpose === 'devour'
                    ? chooseDevourSacrifice(view, d) // CR 702.82a, D-185: the tokens given up for counters, often none
                    : d.purpose === 'crew'
                      ? chooseCrewCreatures(view, d)
                      : d.purpose === 'untapChoice'
                        ? chooseUntap(view, d) // CR 701.26a, D-216: "Untap up to three lands", the agent's own
                        : d.purpose === 'spare'
                          ? chooseSparedPermanent(view, d) // D-231: the permanents Tragic Arrogance keeps
                          : d.purpose === 'effect'
                            ? choosePermanentToReturn(view, d)
                            : d.purpose === 'tap'
                              ? choosePermanentToTap(view, d) // D-133: the permanents tapped for a cost
                              : d.purpose === 'proliferate'
                                ? chooseProliferate(view, d) // CR 701.34a, D-149: the permanents and players that get another counter
                                : d.purpose === 'auraHost'
                                  ? chooseAuraHost(view, d) // CR 303.4f, D-149: what an Aura that enters by an effect enchants
                                  : d.purpose === 'soulbond'
                                    ? chooseSoulbondPartner(view, d) // CR 702.95a, D-984: always pair, with the strongest creature
                                    : d.min === 0
                                      ? chooseAnyNumberToSacrifice(view, d) // D-135: "sacrifice any number of other permanents"
                                      : choosePermanentToSacrifice(view, d),
    chooseCards: (d) => chooseCardsFromZone(view, d),
    arrangeCards: (d) => chooseArrangement(view, d),
    orderTriggers: (d) => orderTriggersAsListed(d),
    confirmOptional: (d) =>
      giftAnswer(view, d) ?? // D-135: Gift
      upkeepAnswer(view, d) ??
      laterAnswer(view, d, worthCasting) ??
      wardDiscardAnswer(view, d) ??
      confirmOptional(d, view),
    chooseOption: (d) => chooseOptionAnswer(view, d),
    // CR 107.3a (D-103): the most X that is worth paying, see casual-x.ts.
    chooseX: (d) => chooseXAnswer(view, d),
    // CR 700.2 (D-114): the set of modes whose text is worth most on this board, see casual-modes.ts.
    chooseModes: (d) => chooseModesAnswer(view, d),
    // CR 601.2f-h (D-120): the creatures and artifacts to tap and the cards to exile for a spell's cost,
    // the ones it wants to keep left out, see casual-pay-options.ts.
    choosePayOptions: (d) => choosePayOptionsAnswer(view, d),
  };
}

export class CasualAgent implements Agent {
  readonly name: string;
  private rng: RngState;
  private readonly overrides: Partial<DecisionHandlers<Action>>;
  private readonly fallbackList: FallbackRecord[] = [];
  /** Abilities activated in the priority window they were activated in (casual-activations.ts). */
  private readonly activations = new Set<string>();

  constructor(options: CasualAgentOptions) {
    this.name = options.name ?? `casual#${options.seed}`;
    this.rng = createRng(options.seed);
    this.overrides = options.handlerOverrides ?? {};
  }

  get fallbacks(): readonly FallbackRecord[] {
    return this.fallbackList;
  }

  /** The full handler record for a view, exposed so tests can check it covers every kind. */
  decisionHandlers(view: GameView): DecisionHandlers<Action> {
    return {
      ...createCasualHandlers(view, (n) => this.draw(n), this.activations),
      ...this.overrides,
    };
  }

  private draw(maxExclusive: number): number {
    const [value, next] = nextInt(this.rng, maxExclusive);
    this.rng = next;
    return value;
  }

  decide(view: GameView, decision: PendingDecision, _ctx: DecideContext): Promise<Action> {
    try {
      return Promise.resolve(handleDecision(decision, this.decisionHandlers(view)));
    } catch (error) {
      this.fallbackList.push({
        decisionKind: decision.kind,
        message: error instanceof Error ? error.message : String(error),
      });
      return Promise.resolve(firstSafeAction(decision));
    }
  }
}

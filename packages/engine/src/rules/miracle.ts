/**
 * Miracle (CR 702.94a, D-274): "You may reveal this card from your hand as you draw it if it's the first card you've drawn this
 * turn. When you reveal this card this way, you may cast it by paying [cost] rather than its mana cost."
 *
 * It is a static ability linked to a triggered ability (CR 603.11), and the engine models the two as three steps:
 *
 *   1. The reveal, a choice made as the card is drawn. When a card is drawn that has a miracle cost and is the first card its owner
 *      has drawn this turn (the `nth` of the `cardDrawn` event: a draw that was replaced is not a card drawn, CR 121.1), its owner is
 *      asked (`confirmOptional`, purpose `'miracleReveal'`) before anything else happens: in the draw step the step waits for the
 *      answer (`rules/flow.ts`, `answerMiracleDraw`), in a resolving spell or ability the instruction `miracleReveal` sits in the
 *      queue between this draw and the next one of the same instruction (`rules/draw.ts`). The question is asked whenever the card
 *      has miracle, whether or not the cost could be paid later: revealing is the player's choice and the engine does not decide it
 *      for them (the cost, the mana and the legal targets are all things that can still change before the trigger resolves).
 *      Declining reveals nothing: no event, no trigger, and the card stays as hidden as any card of the hand.
 *   2. The trigger. Accepting reveals the card (`cardsRevealed`, public, and `miracleRevealed`); the second event is what
 *      `rules/later-triggers.ts` finds the ability from, with the card in the hand as its source. It goes on the stack like every
 *      triggered ability (CR 603.3), where the card is shown (CR 702.94b: it is revealed until the ability resolves or leaves the
 *      stack), can be responded to and is ordered by its controller.
 *   3. The cast, as the trigger resolves: the engine's `castExiled` effect with mode `miracle` (`rules/cast-exiled.ts`), asked only
 *      when the card is still the same object in its owner's hand and could be cast for its miracle cost (a legal target for each
 *      target, additional costs payable, the miracle cost payable with X = 0 at least). Accepting is `beginCast(card, 'miracle',
 *      resolving)`: the steps of CR 601.2a-i with the miracle cost as the alternative cost (CR 118.9), including the announcement of
 *      X (CR 107.3a), no timing restriction and no priority (CR 608.2g). Declining leaves the card in the hand.
 */
import type { Cost } from '../ast/types';
import type { CardId, ObjectId, SeatId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { definitionOf, getSeat, patchObject } from '../state/ops';
import type { GameObject, GameState, Instruction, ResolutionContext } from '../state/types';
import { namedAlternativeCostOf } from './alt-costs';
import { derive } from './derive';
import { grantedMiracleCost, grantedMiracleOf } from './mana-cost-keyword-grant';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';
import { reduceGeneric } from './x-value';

type MiracleInstruction = Extract<Instruction, { kind: 'miracleReveal' }>;

/**
 * The miracle cost of the card's front face (CR 702.94a), or null when it has none: the printed one, else the one a permanent of its owner gives the card in the hand
 * (`grantKeywordFromManaCost`: the mana cost with its generic mana reduced, as it is shown before any X is announced). A card that was revealed for a given miracle keeps the cost
 * it was revealed for (`GameObject.miracleGrant`, CR 113.7a). A card with no mana cost has a given miracle cost that cannot be paid (CR 118.6): it is null here, so the reveal is
 * not offered for a cast that can never happen.
 */
export function miracleCostOf(
  state: GameState,
  obj: GameObject,
  /** The half of a split card a given miracle is read for (CR 709.3); a printed miracle is the front face's. */
  faceIndex = 0,
): readonly Cost[] | null {
  if (obj.card === null) return null;
  const def = definitionOf(state, obj.card);
  const printed = namedAlternativeCostOf(def.faces[0] ?? null, 'miracle');
  if (printed !== null) return faceIndex === 0 ? printed : null;
  const granted = obj.miracleGrant ?? grantedMiracleOf(state, obj);
  if (granted === null) return null;
  return grantedMiracleCost(def.faces[faceIndex] ?? null, granted.reduce, reduceGeneric);
}

/**
 * The faces of `obj`, a card in a hand, that a miracle could cast (CR 702.94a, 709.3): either half of a split card that a permanent gave miracle (each half has a mana cost of its
 * own, and the player chooses which to cast), the front face of every other card.
 */
export function miracleFaces(state: GameState, obj: GameObject): readonly number[] {
  if (obj.card === null) return [0];
  const def = definitionOf(state, obj.card);
  if (def.layout !== 'split' || namedAlternativeCostOf(def.faces[0] ?? null, 'miracle') !== null) {
    return [0];
  }
  return def.faces.map((_, index) => index);
}

/**
 * The state once `card` is revealed as it is drawn (CR 702.94a, 603.11, 113.7a): a card revealed for a miracle a permanent gave it notes the cost of the ability that triggers
 * (`GameObject.miracleGrant`); a card that prints miracle notes nothing.
 */
export function noteMiracleReveal(state: GameState, card: ObjectId): GameState {
  const obj = state.objects[card];
  if (obj === undefined || obj.card === null || obj.zone !== 'hand') return state;
  const face = definitionOf(state, obj.card).faces[0] ?? null;
  if (namedAlternativeCostOf(face, 'miracle') !== null) return state;
  const granted = grantedMiracleOf(state, obj);
  return granted === null ? state : patchObject(state, card, { miracleGrant: granted });
}

/**
 * The card a player may reveal as they drew it, from the events of the draw that just happened: the card drawn is in the hand of
 * `seat`, is the first card they drew this turn and has miracle (CR 702.94a). Null when there is none.
 */
export function miracleOffer(
  state: GameState,
  seat: SeatId,
  events: readonly GameEvent[],
): ObjectId | null {
  for (const e of events) {
    if (e.kind !== 'cardDrawn' || e.seat !== seat || e.nth !== 1) continue;
    const card = state.objects[e.object];
    if (card === undefined || card.zone !== 'hand' || card.owner !== seat) continue;
    if (miracleFaces(state, card).some((face) => miracleCostOf(state, card, face) !== null)) {
      return card.id;
    }
  }
  return null;
}

/** The question "reveal this card?" for the card `card` in the hand of `seat` (the card's own text is its source). */
export function miracleQuestion(state: GameState, seat: SeatId, card: ObjectId): NewDecision {
  const obj = state.objects[card];
  const info = sourceInfo(state, card);
  // The cost shown is the first half's that has one (the cast asks about each half, `rules/cast-exiled.ts`).
  const cost =
    obj === undefined
      ? null
      : (miracleFaces(state, obj)
          .map((face) => miracleCostOf(state, obj, face))
          .find((c) => c !== null) ?? null);
  return {
    kind: 'confirmOptional',
    seat,
    source: card,
    sourceName: info?.name ?? '',
    sourceOracleText: info?.oracleText ?? '',
    purpose: 'miracleReveal',
    subject: card,
    ...(cost === null ? {} : { cost }),
  };
}

/** The events of revealing the card as it is drawn (CR 702.94a): the public reveal, and the one the trigger is found from. */
export function revealMiracleEvents(state: GameState, seat: SeatId, card: ObjectId): GameEvent[] {
  const obj = state.objects[card];
  if (obj === undefined || obj.card === null) return [];
  const cards: readonly CardId[] = [obj.card];
  return [
    { kind: 'cardsRevealed', seat, cards, names: [derive(state, obj).name], from: 'hand' },
    { kind: 'miracleRevealed', seat, object: card },
  ];
}

/**
 * Runs the instruction `miracleReveal` of a resolving spell or ability: the player who drew the card answers; accepting reveals it.
 * Nothing is asked of a player who has lost, or when the card is no longer the drawn card in the hand it was drawn into (an
 * earlier instruction of the same resolution took it away before the question came, which cannot happen between a draw and the
 * instruction right behind it, but the instruction does not rely on that).
 */
export function runMiracleReveal(
  state: GameState,
  _res: ResolutionContext,
  ins: MiracleInstruction,
): StepOutcome {
  const card = state.objects[ins.card];
  if (
    getSeat(state, ins.seat).hasLost ||
    card === undefined ||
    card.zone !== 'hand' ||
    card.owner !== ins.seat
  ) {
    return done(state);
  }
  if (ins.answer === null) {
    return { state, events: [], front: [], needs: miracleQuestion(state, ins.seat, ins.card) };
  }
  if (!ins.answer) return done(state);
  return done(noteMiracleReveal(state, ins.card), revealMiracleEvents(state, ins.seat, ins.card));
}

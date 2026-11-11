/**
 * When the special actions of Suspend and Foretell are legal (CR 116.2f, 116.2h, 702.62a, 702.143a, D-128), and
 * what a suspended or foretold card is. Used both to list the options of a priority decision and to validate the
 * action chosen, as every legality function is, so the UI and the AI cannot diverge from the rules.
 *
 * - Suspend (CR 702.62a, 116.2f): "If you could begin to cast this card by putting it onto the stack from your hand,
 *   you may pay [cost] and exile it with N time counters on it." "Could begin to cast" is the timing of the card
 *   (an instant, or a card with flash, any time; anything else in your main phase with an empty stack) and that no
 *   effect stops it being cast (CR 702.62c: split second is the one the engine has). It does not ask for a legal
 *   target or for the mana cost of the spell: those are looked at when it is cast, at CR 601.2c and 601.2f.
 * - Foretell (CR 702.143a, 116.2h): "Any time a player has priority during their turn, that player may pay {2} and
 *   exile a card with foretell from their hand face down." It has no timing but "your turn".
 * Both cost mana the player must be able to pay now, and neither uses the stack.
 */
import type { Cost } from '../ast/types';
import type { CardFace } from '../cards/definition';
import type { ObjectId, SeatId } from '../ids';
import { getObject, zoneList } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { manaSymbolsOf, namedAlternativeCostOf } from './alt-costs';
import { castAs } from './cast-cost';
import { derive } from './derive';
import { faceOf, timingAllows } from './legality';
import { planFor } from './mana-engine';
import { splitSecondOnStack } from './split-second';

/** The mana of the foretell special action (CR 702.143a). */
export const FORETELL_ACTION_COST: readonly string[] = ['2'];

/** The suspend ability a face prints (CR 702.62a): its number of time counters and its cost, or null. */
export function suspendOf(
  face: CardFace | null,
): { readonly count: number; readonly cost: readonly Cost[] } | null {
  for (const a of face?.abilities ?? []) {
    if (a.kind === 'keyword' && a.keyword.kind === 'suspend') {
      return { count: a.keyword.count, cost: a.keyword.cost };
    }
  }
  return null;
}

/** The foretell cost a face lists (CR 702.143a): what casting the card from exile costs, or null. */
export function foretellCostOf(face: CardFace | null): readonly Cost[] | null {
  return namedAlternativeCostOf(face, 'foretell');
}

/** Whether the card in the hand of `seat` could begin to be cast now as its front face (CR 702.62a, 702.62c). */
function couldBeginToCast(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (obj.zone !== 'hand' || obj.owner !== seat || obj.card === null) return false;
  if (splitSecondOnStack(state)) return false; // CR 702.62c: an effect that stops it being cast
  const spell = castAs(obj, seat, 0);
  if (derive(state, spell).types.includes('land')) return false;
  return timingAllows(state, seat, spell);
}

/** Whether `seat` can pay the mana of a special action now (the planner of every payment). */
function canPay(state: GameState, seat: SeatId, symbols: readonly string[]): boolean {
  return symbols.length === 0 || planFor(state, seat, symbols, { ability: true }) !== null;
}

/** The mana of the suspend action of this card (CR 702.62a), or null when it has no suspend. */
export function suspendSymbols(state: GameState, obj: GameObject): readonly string[] | null {
  const suspend = suspendOf(faceOf(state, obj));
  // {0} is no mana to pay (a cost of "Suspend 3—{0}" is taken without a payment).
  return suspend === null ? null : manaSymbolsOf(suspend.cost).filter((s) => s !== '0');
}

/** CR 702.62a, 116.2f: whether `seat` may suspend `obj` now. */
export function canSuspend(state: GameState, seat: SeatId, obj: GameObject): boolean {
  const symbols = suspendSymbols(state, obj);
  if (symbols === null || !couldBeginToCast(state, seat, obj)) return false;
  return canPay(state, seat, symbols);
}

/** The cards in the hand of `seat` it may suspend now, in hand order. */
export function suspendableObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'hand', seat).filter((id) =>
    canSuspend(state, seat, getObject(state, id)),
  );
}

/** CR 702.143a, 116.2h: whether `seat` may foretell `obj` now: it is their turn and they can pay {2}. */
export function canForetell(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (obj.zone !== 'hand' || obj.owner !== seat || obj.card === null) return false;
  if (state.turn.activeSeat !== seat) return false;
  if (foretellCostOf(faceOf(state, obj)) === null) return false;
  if (derive(state, castAs(obj, seat, 0)).types.includes('land')) return false;
  return canPay(state, seat, FORETELL_ACTION_COST);
}

/** The cards in the hand of `seat` it may foretell now, in hand order. */
export function foretellableObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'hand', seat).filter((id) =>
    canForetell(state, seat, getObject(state, id)),
  );
}

/** A card of the seat's own that is in exile foretold (face down, CR 702.143a): whoever it is, only its owner may look. */
export function isForetold(obj: GameObject): boolean {
  return obj.zone === 'exile' && obj.foretoldTurn !== undefined;
}

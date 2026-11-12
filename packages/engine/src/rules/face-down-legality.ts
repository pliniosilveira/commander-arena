/**
 * When turning a face-down permanent face up is legal (CR 116.2b, 701.40b, D-310), and what it costs. Used both to list the options of a priority decision (`rules/priority.ts`)
 * and to validate the action chosen (`rules/face-down-actions.ts`), as every legality function is, so the UI and the AI cannot diverge from the rules. It imports nothing that
 * lists priority options, so `priority.ts` can import it.
 */
import type { ObjectId, SeatId } from '../ids';
import { definitionOf, getObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { faceDownBy, faceDownPermanents } from './face-down';
import { planFor } from './mana-engine';

/**
 * The mana symbols that turning `obj` face up costs, or null when it can't be turned face up (CR 701.40b): it is not a face-down permanent on the battlefield, the card behind
 * it is not a creature card, or the card has no mana cost. An {X} in the cost is 0 (CR 107.3: X is 0 for an object that is not a spell or on the stack), and a {0} is no mana.
 */
export function turnUpSymbols(state: GameState, obj: GameObject): readonly string[] | null {
  if (obj.zone !== 'battlefield' || obj.card === null || faceDownBy(obj) !== 'manifest') {
    return null;
  }
  const face = definitionOf(state, obj.card).faces[0];
  if (face === undefined || !face.types.includes('creature') || face.manaCost === null) {
    return null;
  }
  return face.manaCost.filter((symbol) => symbol !== 'X' && symbol !== '0');
}

/** CR 701.40b, 116.2b: whether `seat` may turn `obj` face up now: it controls it, it can be turned face up, and the seat can pay its cost. */
export function canTurnFaceUp(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (controllerOf(state, obj) !== seat) return false;
  const symbols = turnUpSymbols(state, obj);
  if (symbols === null) return false;
  return symbols.length === 0 || planFor(state, seat, symbols, { ability: true }) !== null;
}

/** The face-down permanents `seat` may turn face up now, in battlefield order. */
export function turnableObjects(state: GameState, seat: SeatId): ObjectId[] {
  // Face-down permanents are few and the options are listed at every priority decision: the others are skipped before anything is derived.
  return faceDownPermanents(state).filter(
    (id) =>
      state.objects[id]?.zone === 'battlefield' && canTurnFaceUp(state, seat, getObject(state, id)),
  );
}

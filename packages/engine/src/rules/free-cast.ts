/**
 * The permissions of `mayCastEachType` (`ContinuousEffect` `freeCastPermission`, made by `rules/free-cast-effect.ts`): "Until end of turn, for each nonland card type, you may
 * cast a spell of that type from among the exiled cards without paying its mana cost" (CR 601.2, 118.9, 611.2a). What a player may do with them is decided where casting is
 * (`rules/legality.ts`): a card in exile that a permission of their
 * own names, and whose face has the permission's type, is cast without paying its mana cost, at the timing of its type (CR 601.3: the permission is not a timing exception),
 * with its additional costs (CR 118.8) and an {X} of 0 (CR 107.3b). Casting uses up one permission: a card with several types is cast as any one of them (CR 601.2:
 * the player chooses how to cast it), and the permission that is used is the one that leaves the most of the other exiled cards castable, which is what the player would
 * choose to cast as many of them as they can. The permission names the card as it is: a card that leaves exile is a new object (CR 400.7) and has none.
 */
import type { CardType } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import type { ContinuousEffect, GameObject, GameState } from '../state/types';
import { castAs } from './cast-cost';
import { derive } from './derive';
import { largestSet } from './slot-matching';

type FreeCastEffect = ContinuousEffect & {
  readonly change: Extract<ContinuousEffect['change'], { kind: 'freeCastPermission' }>;
};

function isFreeCast(e: ContinuousEffect): e is FreeCastEffect {
  return e.change.kind === 'freeCastPermission';
}

/** The types the face of `obj` being cast has (CR 709.3a: only that face is looked at). */
function typesOf(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  face: number,
): readonly CardType[] {
  return derive(state, castAs(obj, seat, face)).types;
}

/** The permissions of `seat` that name the card `obj` in exile. */
function permissionsFor(state: GameState, seat: SeatId, obj: GameObject): FreeCastEffect[] {
  if (obj.zone !== 'exile') return [];
  return state.continuousEffects
    .filter(isFreeCast)
    .filter((e) => e.change.seat === seat && e.objects.includes(obj.id));
}

/** The permissions of `seat` that let it cast the card `obj` in exile as its face `face` now: one for each type the face has. */
export function freeCastSlots(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  face = 0,
): readonly FreeCastEffect[] {
  const found = permissionsFor(state, seat, obj);
  if (found.length === 0) return [];
  const types = typesOf(state, seat, obj, face);
  return found.filter((e) => types.includes(e.change.type));
}

/** The cards in exile that a permission of `seat` names. */
export function freeCastCards(state: GameState, seat: SeatId): ObjectId[] {
  const ids = new Set<ObjectId>();
  for (const e of state.continuousEffects) {
    if (!isFreeCast(e) || e.change.seat !== seat) continue;
    for (const id of e.objects) {
      if (state.objects[id]?.zone === 'exile') ids.add(id);
    }
  }
  return [...ids];
}

/**
 * The permission used up by casting the card `obj` as its face `face` (null when there is none): of those that fit the face, the one after which the most of the
 * other exiled cards of `seat` can still be cast, the first in the order of the card types when several do.
 */
export function freeCastSlotToUse(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  face = 0,
): ContinuousEffect | null {
  const fits = freeCastSlots(state, seat, obj, face);
  const [first] = fits;
  if (first === undefined) return null;
  if (fits.length === 1) return first;
  const others = freeCastCards(state, seat)
    .filter((id) => id !== obj.id)
    .map((id) => state.objects[id])
    .filter((o): o is GameObject => o !== undefined)
    .map((o) => derive(state, castAs(o, seat, 0)).types);
  const left = state.continuousEffects.filter(isFreeCast).filter((e) => e.change.seat === seat);
  // One permission for each type is left for every card that can be cast: the types of the permissions, as a list.
  let best: FreeCastEffect = first;
  let bestSize = -1;
  for (const candidate of fits) {
    const remaining = left.filter((e) => e.id !== candidate.id).map((e) => e.change.type);
    const size = largestSet(others, remaining);
    if (size > bestSize) {
      best = candidate;
      bestSize = size;
    }
  }
  return best;
}

/**
 * What the rest of the engine reads about the Ring (CR 701.54, D-196), in a module that imports no rule that reads `derive`, so `derive` itself can
 * use it: how often the Ring has tempted a player, and who is whose Ring-bearer.
 */
import type { SeatId } from '../ids';
import { getSeat } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';

/** How many times the Ring has tempted `seat` (0 before the emblem exists, CR 701.54c). */
export function ringLevel(state: GameState, seat: SeatId): number {
  return getSeat(state, seat).ring?.tempted ?? 0;
}

/** CR 701.54e: the creature is on the battlefield under `seat`'s control and has the Ring-bearer designation of `seat`. */
export function isRingBearerOf(state: GameState, obj: GameObject, seat: SeatId): boolean {
  return obj.ringBearer === seat && obj.zone === 'battlefield' && controllerOf(state, obj) === seat;
}

/** The creature that is the Ring-bearer of `seat` (CR 701.54e), or null. */
export function ringBearerOf(state: GameState, seat: SeatId): GameObject | null {
  for (const obj of Object.values(state.objects)) {
    if (obj.ringBearer === seat && isRingBearerOf(state, obj, seat)) return obj;
  }
  return null;
}

/** The player whose Ring-bearer the object is now (CR 701.54e), or null. */
export function ringBearerSeat(state: GameState, obj: GameObject): SeatId | null {
  return obj.ringBearer !== undefined && isRingBearerOf(state, obj, obj.ringBearer)
    ? obj.ringBearer
    : null;
}

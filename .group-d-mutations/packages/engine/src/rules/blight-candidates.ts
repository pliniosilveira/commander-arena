/**
 * The creatures a blight can put -1/-1 counters on (D-407, CR 701.68a, 701.68b): the leaf of `rules/activate-blight.ts`, which pays the cost, and of
 * `rules/activate-costs.ts`, which asks whether it can be paid.
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { counterBlocked } from './counter-prevention';
import { derive } from './derive';

/** The counter a blight puts on a creature (CR 701.68a). */
export const BLIGHT_COUNTER = '-1/-1';

/**
 * The creatures `seat` controls that a blight can put -1/-1 counters on (CR 701.68a, 701.68b), in battlefield order. A creature that can't have -1/-1
 * counters put on it (CR 122.6, 101.2: `cantHaveCounters`) is no candidate, and with none a player can't choose to blight.
 */
export function blightCandidates(state: GameState, seat: SeatId): ObjectId[] {
  return state.battlefield.filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      controllerOf(state, obj) === seat &&
      derive(state, obj).types.includes('creature') &&
      !counterBlocked(state, obj, BLIGHT_COUNTER)
    );
  });
}

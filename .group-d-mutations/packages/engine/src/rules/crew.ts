/**
 * Crew (CR 702.122, 301.7): which creatures can pay the cost of a crew ability and whether a choice
 * of them is enough. "Crew N" is "Tap any number of other untapped creatures you control with total
 * power N or greater" (CR 702.122a), expanded in `derive-keywords.ts` into an activated ability
 * whose cost is `tapCreatures`; `activate.ts` asks for the creatures with a `choosePermanent`
 * decision (`purpose: 'crew'`) and these functions say who may be chosen and check the answer.
 *
 * - Only creatures the activating player controls, untapped, and never the Vehicle itself ("other").
 *   A Vehicle that is already a creature (crewed) can crew another Vehicle.
 * - A creature that came under control this turn may crew: its own {T} abilities are what CR 302.6
 *   restricts, and tapping it for another permanent's cost is not one.
 * - Power is what `derive` gives now (CR 613.4), counters and effects included. The total is a sum,
 *   so a creature with negative power lowers it (CR 702.122a says "total power").
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** The creatures `seat` could tap to crew `source`, in battlefield order (deterministic). */
export function crewCandidates(state: GameState, seat: SeatId, source: ObjectId): ObjectId[] {
  return state.battlefield.filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      id !== source &&
      controllerOf(state, obj) === seat &&
      !obj.tapped &&
      derive(state, obj).types.includes('creature')
    );
  });
}

/** The power of `id` as the engine derives it now; 0 for an object that is gone or has none. */
export function crewPowerOf(state: GameState, id: ObjectId): number {
  const obj = state.objects[id];
  return obj === undefined ? 0 : (derive(state, obj).power ?? 0);
}

/** The total power of the creatures `ids` (CR 702.122a). */
export function totalPower(state: GameState, ids: readonly ObjectId[]): number {
  return ids.reduce((sum, id) => sum + crewPowerOf(state, id), 0);
}

/** Why `seat` cannot pay a crew cost of `needed` for `source` now, or null when it can. */
export function crewRefusal(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  needed: number,
): string | null {
  const candidates = crewCandidates(state, seat, source);
  if (candidates.length === 0) return 'you control no other untapped creature to crew with';
  if (totalPower(state, candidates) < needed) {
    return `your other untapped creatures have less than ${needed} total power`;
  }
  return null;
}

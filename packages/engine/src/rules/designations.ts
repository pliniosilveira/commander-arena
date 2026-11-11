/**
 * Who has a designation (CR 725.1, 702.131c, D-ASCEND): the monarch is one player or nobody (`GameState.monarch`), the city's blessing any number
 * of players (`SeatState.citysBlessing`). Kept apart from `city-blessing.ts` because the conditions that read it are read by `derive`, which that
 * file reads.
 */

import type { Designation } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameState } from '../state/types';

/** The players who have the city's blessing, in seat order (CR 702.131c: any number). */
export function citysBlessingHolders(state: GameState): SeatId[] {
  return state.seats.filter((s) => s.citysBlessing === true).map((s) => s.id);
}

/** The players who have a designation now. */
export function designationHolders(state: GameState, designation: Designation): SeatId[] {
  if (designation === 'citysBlessing') return citysBlessingHolders(state);
  return state.monarch === null ? [] : [state.monarch];
}

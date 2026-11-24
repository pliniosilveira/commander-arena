/**
 * Who has a designation (CR 725.1, 702.131c, D-264): the monarch is one player or nobody (`GameState.monarch`), the city's blessing any number
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
  if (designation === 'initiative') {
    return state.initiative === undefined || state.initiative === null ? [] : [state.initiative];
  }
  return state.monarch === null ? [] : [state.monarch];
}

/** CR 702.179e: a player has max speed if their speed is 4. Speed does not go past it (the repository's CR text states no cap, so this is unverified). */
export const MAX_SPEED = 4;

/** CR 702.179b, 702.179f: the speed of a player, 0 when they have none. Kept here with the other reads that `derive` makes (a condition of a static ability reads it). */
export function speedOf(state: GameState, seat: SeatId): number {
  return state.seats[seat]?.speed ?? 0;
}

/** CR 702.179e: whether the player has max speed. */
export function hasMaxSpeed(state: GameState, seat: SeatId): boolean {
  return speedOf(state, seat) >= MAX_SPEED;
}

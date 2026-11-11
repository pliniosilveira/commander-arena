/**
 * The colors of a player's commanders (CR 903.4) without the derived characteristics of any object, so that `derive` itself may read them
 * (`derive-statics.ts`, `protection.ts`) without an import cycle. `commander-identity.ts` re-exports `commanderIdentity` and adds what needs `derive`.
 */
import type { Color } from '../characteristics';
import { COLORS } from '../characteristics';
import type { SeatId } from '../ids';
import { definitionOf, getSeat } from '../state/ops';
import type { GameState } from '../state/types';

/** CR 903.4: the colors in the color identity of the seat's commanders. */
export function commanderIdentity(state: GameState, seat: SeatId): Color[] {
  const colors = new Set<Color>();
  for (const card of getSeat(state, seat).commanders) {
    for (const c of definitionOf(state, card).colorIdentity) colors.add(c);
  }
  return COLORS.filter((c) => colors.has(c));
}

/**
 * CR 903.4, 903.4f (D-256): "each color that's not in your commander's color identity". The colors of the five that no commander of the seat has in its
 * color identity. A player with no commander has no color identity to compare with: the quality is undefined and that part of the ability does nothing,
 * so the list is empty (a commander with a colorless identity gives all five colors).
 */
export function colorsNotInCommanderIdentity(state: GameState, seat: SeatId): Color[] {
  if (getSeat(state, seat).commanders.length === 0) return [];
  const identity = commanderIdentity(state, seat);
  return COLORS.filter((c) => !identity.includes(c));
}

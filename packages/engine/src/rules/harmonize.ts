/**
 * Harmonize (CR 702.180a): the card is cast from its owner's graveyard for the harmonize cost (an alternative cost, a named one of the face:
 * `rules/cast-cost.ts`), and the caster may tap one untapped creature they control to reduce the total cost by an amount of generic mana equal to
 * its power. The creature is chosen as the cost is announced (CR 702.180b, 601.2b): `rules/cast.ts` asks after the cost choices and before X, so the
 * largest X the caster can pay counts the reduction, and the answer is kept on the spell (`StackData.harmonizeTap`, null for none). The creature is
 * tapped as the answer is taken, which is part of paying the total cost (CR 601.2h); cancelling the cast gives the state back (CR 733). A creature
 * that is already tapped, or that has no power, reduces nothing and is not offered.
 */
import type { ObjectId, SeatId } from '../ids';
import { patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** The untapped creatures `seat` controls with power 1 or more that could be tapped for a harmonize cost (summoning sickness does not matter, CR 302.6). */
export function harmonizeCandidates(state: GameState, seat: SeatId): ObjectId[] {
  const out: ObjectId[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || obj.tapped || controllerOf(state, obj) !== seat) continue;
    const d = derive(state, obj);
    if (d.types.includes('creature') && (d.power ?? 0) > 0) out.push(id);
  }
  return out;
}

/**
 * The ways a harmonize cost may be paid, as the creature tapped (null for none), each with the state it is paid in: the creature tapped, so that it can no
 * longer pay mana for the rest of the cost. What the check that the card can be cast at all (`canCast`) and the question of which creature to tap both read.
 */
export function harmonizeWays(
  state: GameState,
  seat: SeatId,
): { readonly tap: ObjectId | null; readonly state: GameState }[] {
  return [
    { tap: null, state },
    ...harmonizeCandidates(state, seat).map((id) => ({
      tap: id,
      state: patchObject(state, id, { tapped: true }),
    })),
  ];
}

/** The power of a creature, the generic mana it reduces a harmonize cost by (CR 702.180a). */
export function harmonizePower(state: GameState, creature: ObjectId): number {
  const obj = state.objects[creature];
  return obj === undefined ? 0 : Math.max(0, derive(state, obj).power ?? 0);
}

/**
 * The generic mana a harmonize cost is reduced by: the power of the creature the caster tapped; before the choice is made (the check that the card
 * may be cast at all, `optimistic`) the most any creature they could tap would give.
 */
export function harmonizeReduction(
  state: GameState,
  seat: SeatId,
  chosen: ObjectId | null | undefined,
  optimistic: boolean,
): number {
  if (chosen !== undefined) return chosen === null ? 0 : harmonizePower(state, chosen);
  if (!optimistic) return 0;
  return Math.max(0, ...harmonizeCandidates(state, seat).map((id) => harmonizePower(state, id)));
}

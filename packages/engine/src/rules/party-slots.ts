/**
 * What the choosing of a party reads from the game (CR 700.8d, Stick Together): the creatures a player controls and, for each party type, the ones that could fill it.
 * Kept apart from `party.ts` because it reads `derive`, which in turn needs the pure party size of `party.ts`.
 */
import { PARTY_TYPES } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import { objectsInZone } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import type { PartySlot } from './party';

/** CR 700.8d: the creatures `seat` controls (as `derive` gives them now), in object order. */
export function creaturesControlledBy(state: GameState, seat: SeatId): ObjectId[] {
  return objectsInZone(state, 'battlefield').filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      controllerOf(state, obj) === seat &&
      derive(state, obj).types.includes('creature')
    );
  });
}

/** CR 700.8d: for each party type, the creatures among `creatures` that have it (Changeling and the like are in `derive`'s subtypes). */
export function partySlots(state: GameState, creatures: readonly ObjectId[]): PartySlot[] {
  return PARTY_TYPES.map((type) => ({
    type,
    legal: creatures.filter((id) => {
      const obj = state.objects[id];
      return obj !== undefined && derive(state, obj).subtypes.includes(type);
    }),
  }));
}

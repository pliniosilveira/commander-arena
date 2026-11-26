/**
 * "Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast." (Urianger Augurelt, CR 601.2f, 118.7a): the generic mana the cost of a spell goes
 * down by because of the permission (`playPermission`, `mayPlay.lessGeneric`) of `seat` it is cast from exile with. A card that left exile is a new object (CR 400.7), so only the
 * permission that names this very object counts; once the card is cast the spell carries `StackData.lessGeneric` (`rules/cast.ts`). With several permissions on the card the player
 * casts it with the one that helps most, so the largest reduction counts (two of them never add up: the spell is cast with one permission).
 */
import type { ObjectId, SeatId } from '../ids';
import { opponentsOf } from '../state/ops';
import type { GameState } from '../state/types';

export function playPermissionLess(state: GameState, seat: SeatId, object: ObjectId): number {
  let best = 0;
  for (const e of state.continuousEffects) {
    if (
      e.change.kind !== 'playPermission' ||
      e.change.seat !== seat ||
      !e.objects.includes(object)
    ) {
      continue;
    }
    if (e.change.lessGeneric !== undefined) best = Math.max(best, e.change.lessGeneric);
    // CR 702.125a, 702.125b (Durnan): undaunted is one less for each opponent of the caster still in the game, counted now, as the cost is determined (CR 601.2f).
    if (e.change.undaunted === true) best = Math.max(best, opponentsOf(state, seat).length);
  }
  return best;
}

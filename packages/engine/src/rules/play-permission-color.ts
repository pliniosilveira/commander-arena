/**
 * "Until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell" (issue 144, CR 609.4b): whether a permission of
 * `seat` to cast the card in exile `object` (`playPermission`, `mayPlay`) carries the rider. A card that left exile is a new object (CR 400.7), so only the permission that names
 * this very object counts; once the card is cast the spell carries `StackData.anyManaColor` (`rules/cast.ts`).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';

export function playPermissionAnyColor(state: GameState, seat: SeatId, object: ObjectId): boolean {
  return state.continuousEffects.some(
    (e) =>
      e.change.kind === 'playPermission' &&
      e.change.seat === seat &&
      e.change.anyManaColor === true &&
      e.objects.includes(object),
  );
}

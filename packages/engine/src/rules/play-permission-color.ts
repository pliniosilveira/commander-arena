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

/**
 * "... and mana of any type can be spent to cast that spell" (Hostage Taker, CR 609.4b): as `playPermissionAnyColor`, for the permission's `anyManaType` rider (any mana pays any symbol,
 * colored or colorless).
 */
export function playPermissionAnyType(state: GameState, seat: SeatId, object: ObjectId): boolean {
  return state.continuousEffects.some(
    (e) =>
      e.change.kind === 'playPermission' &&
      e.change.seat === seat &&
      e.change.anyManaType === true &&
      e.objects.includes(object),
  );
}

/**
 * "If that spell would be put into a graveyard, exile it instead" (Dire Fleet Daredevil, CR 614.1a): whether the spell cast from exile with a permission of `seat` that names `object`
 * carries the rider. It does when every permission that names the card carries it (a player with another permission without the rider casts the card with that one, as they may choose).
 */
export function playPermissionExiles(state: GameState, seat: SeatId, object: ObjectId): boolean {
  const grants = state.continuousEffects.filter(
    (e) =>
      e.change.kind === 'playPermission' && e.change.seat === seat && e.objects.includes(object),
  );
  return (
    grants.length > 0 &&
    grants.every((e) => e.change.kind === 'playPermission' && e.change.exileInstead === true)
  );
}

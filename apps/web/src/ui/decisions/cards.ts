/** Choosing exactly N cards from the hand (mulligan bottom, cleanup discard). */
import type { ObjectId } from '@commander-arena/engine';

/** Toggles a card; a card beyond the limit is not added (the player takes another one back first). */
export function toggleCard(
  chosen: readonly ObjectId[],
  hand: readonly ObjectId[],
  id: ObjectId,
  count: number,
): readonly ObjectId[] {
  if (chosen.includes(id)) return chosen.filter((c) => c !== id);
  if (!hand.includes(id) || chosen.length >= count) return chosen;
  return [...chosen, id];
}

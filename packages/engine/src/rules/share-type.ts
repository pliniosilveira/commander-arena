/** The land types two or more cards found by one search must have in common (D-258, CR 205.3i, 701.23). */
import type { ObjectId } from '../ids';

/** CR 205.3i (D-258): whether the cards have a land type in common, by the land types the decision lists for each (one card, or none, always does). */
export function sharesLandType(
  chosen: readonly ObjectId[],
  types: Readonly<Record<ObjectId, readonly string[]>>,
): boolean {
  const [first, ...rest] = chosen;
  if (first === undefined || rest.length === 0) return true;
  return (types[first] ?? []).some((t) => rest.every((id) => (types[id] ?? []).includes(t)));
}

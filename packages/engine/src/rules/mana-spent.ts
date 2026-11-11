/**
 * The mana spent to cast a spell (CR 601.2h, D-183): "the amount of mana spent to cast it" and "for each mana from an artifact source spent to cast it".
 * Read from the object, which is the spell on the stack (it wrote the count as the cost was paid, `rules/cast.ts`) or its last-known information once it has
 * left the stack (CR 113.7a). A permanent that came from a spell has left the stack: the replacement effects that count the mana spent on the permanent
 * that enters read it from the spell as it enters (`rules/enters-group.ts`). Anything that was not cast for mana has 0.
 */
import type { GameObject } from '../state/types';

/** How much mana was spent to cast `obj`, in all or (with `fromType`) from sources that have that card type. */
export function manaSpentOf(obj: GameObject | null, fromType?: string): number {
  const spent = obj?.stack?.manaSpent;
  if (spent === undefined) return 0;
  return fromType === undefined ? spent.total : (spent.fromTypes[fromType] ?? 0);
}

/**
 * A matching of cards to permanent type slots, shared by the permissions that give one play for each type (`mayCastEachType`, `playFromGraveyardEachType`).
 */
import type { CardType } from '../characteristics';

/** The size of the largest set of cards that can each be cast as a type of their own with a permission of its own (bipartite matching, by augmenting paths). */
export function largestSet(
  cards: readonly (readonly CardType[])[],
  slots: readonly CardType[],
): number {
  const owner: number[] = slots.map(() => -1);
  const place = (card: number, seen: boolean[]): boolean => {
    for (let s = 0; s < slots.length; s += 1) {
      const slot = slots[s];
      if (slot === undefined || seen[s] === true || cards[card]?.includes(slot) !== true) continue;
      seen[s] = true;
      const held = owner[s];
      if (held === undefined || held === -1 || place(held, seen)) {
        owner[s] = card;
        return true;
      }
    }
    return false;
  };
  let size = 0;
  for (let c = 0; c < cards.length; c += 1) {
    if (
      place(
        c,
        slots.map(() => false),
      )
    )
      size += 1;
  }
  return size;
}

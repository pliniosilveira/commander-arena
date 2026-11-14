/**
 * How many times a spell or a permanent was kicked (CR 702.33c, 702.33d, D-110): the count the caster chose
 * for Multikicker, 1 for Kicker paid once, 0 for none. Read from the object, which is the spell on the
 * stack or the permanent that remembers it, or its last-known information once it has left (CR 113.7a).
 */
import type { GameObject } from '../state/types';

export function timesKickedOf(obj: GameObject | null): number {
  if (obj === null) return 0;
  const counted = obj.stack?.kicks ?? obj.kicks;
  if (counted !== undefined) return counted;
  return obj.stack?.kicked === true || obj.kicked === true ? 1 : 0;
}

/**
 * The mana value of an object (CR 202.3), for `manaValueOf` amounts and the `manaValue` comparison of
 * an `ObjectFilter` (D-111).
 */
import { manaValue } from '../mana';
import type { GameObject } from '../state/types';
import { xSymbolCount } from './x-value';

/**
 * The mana value of `cost`, the mana cost the object has (null for none: 0, CR 202.3a). An {X} counts as
 * the number announced while the object is a spell on the stack and as 0 anywhere else (CR 202.3e).
 * `object` is the object as it is, or as it last was when it has left (CR 608.2h).
 */
export function manaValueOfCost(
  cost: readonly string[] | null,
  object: GameObject | undefined,
): number {
  if (cost === null) return 0;
  const onStack = object?.zone === 'stack' && object.stack?.kind === 'spell';
  return manaValue(cost) + (onStack ? (object.stack?.x ?? 0) * xSymbolCount(cost) : 0);
}

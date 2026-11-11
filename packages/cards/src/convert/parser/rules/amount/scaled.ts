/**
 * A quantity and a count after "for each" (stage P28, D-131): "draw a card for each creature you control", "gain 2
 * life for each creature you control with power 4 or greater", "create two Zombie tokens for each opponent who has
 * more cards in hand than you". A quantity of one makes the count the amount; a quantity of two or more multiplies it
 * (CR 608.2c: counted as the instruction runs), the engine's `multiple`. An X, which a "for each" would multiply by a
 * number nobody has chosen, is not read.
 */
import { literal, map, type Parser, sequence } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { family } from '../registry';
import { FOR_EACH_AMOUNTS } from './kicked';

/** " for each creature you control", " for each time it was kicked", ...: the count that follows a quantity. */
export const FOR_EACH_TAIL: Parser<IrAmount> = map(
  sequence(literal(' '), family<IrAmount>('amount', { only: FOR_EACH_AMOUNTS })),
  ([, amount]) => amount,
);

/** The amount of "<quantity> ... for each <count>", or null for a quantity that cannot be multiplied (X, a count). */
export function scaled(quantity: IrAmount, each: IrAmount): IrAmount | null {
  if (quantity.kind !== 'number' || quantity.value < 1) return null;
  if (quantity.value === 1) return each;
  return {
    kind: 'multiple',
    factor: quantity.value,
    of: each,
    span: { start: quantity.span.start, end: each.span.end },
  };
}

/**
 * The amounts that follow "equal to" (stage P28, D-131): a count of objects, the power or mana value of an object, and
 * every other value phrase of the amount family ("the greatest power among creatures you control", "that creature's
 * toughness", "your devotion to black", "half the number of ..., rounded down").
 */
export const EQUAL_AMOUNTS = [
  'amount.equal-to',
  'amount.number-of',
  'amount.power-of',
  'amount.mana-value-of',
  // Stage P52 (D-210): "equal to the total mana value of those cards" after a mill.
  'amount.milled-value-this-way',
] as const;

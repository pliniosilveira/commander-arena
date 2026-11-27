/**
 * Condition of the Theros gods (Mogis, God of Slaughter): "your devotion to black and red is less than seven" (CR 700.5: devotion is the mana symbols of the colors among the mana costs of
 * the permanents a player controls; CR 604.1, 611.3a).
 */
import { choice, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrComparison, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { DEVOTION } from '../amount/value';
import { defineRule, spanned } from '../registry';

/**
 * `condition.devotion`: "your devotion to black and red is less than seven", "your devotion to red is five or more" (CR 700.5, 613.8): the devotion of the controller to the colors
 * named, compared with a number. The engine's `amountIs` of a `devotion`, read when the condition is read (the mana symbols of the permanents the player controls, so a permanent that
 * is not a creature still counts). Not read: another player's devotion ("an opponent's devotion"), a number that is 0, X or missing, "less than" with no number, "more than",
 * "fewer", "equal to", a color that is not a color or one said twice, and "devotion" with no color.
 */
export const CONDITION_DEVOTION = defineRule<IrCondition>({
  id: 'condition.devotion',
  family: 'condition',
  leading: ['your'],
  cites: [
    'CR 700.5 (Devotion)',
    'CR 604.1 (Handling Static Abilities)',
    'CR 611.3a (Continuous Effects from Static Abilities)',
  ],
  examples: [
    'your devotion to black and red is less than seven',
    'your devotion to red is less than five',
    'your devotion to white is seven or more',
    'your devotion to green, white, and blue is 3 or more',
  ],
  rejects: [
    'your devotion to black and red is less than seven.',
    "an opponent's devotion to black is less than seven",
    'your devotion to black and red is less than',
    'your devotion to black and red is less than X',
    'your devotion to black and red is less than 0',
    'your devotion to black and red is more than seven',
    'your devotion to black and red is seven',
    'your devotion to black and black is less than seven',
    'your devotion to is less than seven',
    'your devotion to purple is less than seven',
    'your devotion to black and red is seven or less',
  ],
  parse: (ctx, pos) => {
    const head = spanned(DEVOTION)(ctx, pos);
    if (!head.ok) return head;
    const amount: IrAmount = head.value.value;
    const compare = choice<IrComparison>(
      map(
        sequence(
          literal(' is less than '),
          satisfy(quantity, (n) => n >= 1),
        ),
        ([, n]): IrComparison => ({ cmp: 'atMost', value: n - 1 }),
      ),
      map(
        sequence(
          literal(' is '),
          satisfy(quantity, (n) => n >= 1),
          pattern(/ or more(?![\p{L}\p{N}])/iu),
        ),
        ([, n]): IrComparison => ({ cmp: 'atLeast', value: n }),
      ),
    )(ctx, head.pos);
    if (!compare.ok) return compare;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'amountIs', amount, compare: compare.value },
        span: { start: pos, end: compare.pos },
        rule: 'condition.devotion',
      },
      pos: compare.pos,
    };
  },
});

export const DEVOTION_CONDITION_RULES = [CONDITION_DEVOTION];

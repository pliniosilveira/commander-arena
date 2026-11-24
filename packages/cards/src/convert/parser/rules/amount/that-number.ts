/**
 * Amount rule of the Final Fantasy X counter group (Yuna, Grand Summoner): "that number" of the counters a permanent had.
 */
import { map, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `amount.that-number`: "that number" (CR 603.10a, 122.1: the number of counters the permanent a trigger is about had as it left the battlefield, named by the intervening "if it had one or more
 * counters on it"). It reads like "that many" with a marker word, so the lowering of such a trigger turns it into the counters of the permanent and refuses it anywhere else. Not read: "that
 * numbers", "that many", "that much", "that", "the number".
 */
export const AMOUNT_THAT_NUMBER = defineRule<IrAmount>({
  id: 'amount.that-number',
  family: 'amount',
  leading: ['that'],
  cites: ['CR 603.10a (Handling Triggered Abilities)', 'CR 122.1 (Counters)'],
  examples: ['that number', 'That number'],
  rejects: ['that numbers', 'that many', 'that much', 'that', 'the number', 'that numbering'],
  parse: map(
    spanned(pattern(/that number(?![\p{L}\p{N}])/iu)),
    ({ span }): IrAmount => ({
      kind: 'thisWay',
      what: 'sacrificed',
      words: ['number'],
      thatMany: true,
      span,
    }),
  ),
});

export const THAT_NUMBER_AMOUNT_RULES = [AMOUNT_THAT_NUMBER];

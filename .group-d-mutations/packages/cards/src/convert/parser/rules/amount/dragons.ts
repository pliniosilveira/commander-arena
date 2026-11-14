/**
 * Amount rules of stage P34 (D-151, D-152): "for each of those cards that are still exiled" (CR 400.7, 603.7: the cards an instruction of the same
 * text exiled, counted when the delayed trigger that reads them resolves; a card that left exile is a new object and is not counted).
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.for-each-still-exiled`: "for each of those cards that are still exiled". It follows a quantity like `amount.for-each` does ("deals 2 damage
 * to each opponent for each of those cards that are still exiled"). It reads the cards the instruction before it in the same text exiled; the
 * lowering refuses it anywhere but in what a delayed trigger does after such an instruction.
 */
export const AMOUNT_FOR_EACH_STILL_EXILED = defineRule<IrAmount>({
  id: 'amount.for-each-still-exiled',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 400.7 (General)', 'CR 603.7 (Handling Triggered Abilities)'],
  examples: [
    'for each of those cards that are still exiled',
    'For each of those cards that are still exiled',
  ],
  rejects: [
    'for each of those cards that are exiled',
    'for each of those cards still exiled',
    'for each of those cards that is still exiled',
    'for each of those cards that are still exiled.',
    'for each card that is still exiled',
    'for each of those creatures that are still exiled',
    'for each of these cards that are still exiled',
    'for each of those cards that are still in exile',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each of those cards that are still exiled(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'exiledStillThere', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

/**
 * Amount rule of deck support issue 144 (Glimpse the Impossible): "for each card put into your graveyard this way" (CR 608.2c, 400.7: the cards the instruction before it put into the
 * graveyard of the controller).
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.for-each-card-put-into-your-graveyard`: "for each card put into your graveyard this way". It follows a quantity like `amount.for-each` does ("create a 0/1 ... token for
 * each card put into your graveyard this way"). It counts the cards the instruction before it moved into the graveyard (`movedCount`); the lowering refuses it after any other
 * instruction. Not read: "a graveyard", another zone or another verb, a type of card, "cards".
 */
export const AMOUNT_FOR_EACH_CARD_PUT_INTO_YOUR_GRAVEYARD = defineRule<IrAmount>({
  id: 'amount.for-each-card-put-into-your-graveyard',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 404.1 (Graveyard)'],
  examples: ['for each card put into your graveyard this way'],
  rejects: [
    'for each card put into a graveyard this way',
    "for each card put into an opponent's graveyard this way",
    'for each card put into your graveyard',
    'for each cards put into your graveyard this way',
    'for each creature card put into your graveyard this way',
    'for each card put into your hand this way',
    'for each card exiled this way',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each card put into your graveyard this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'movedCount', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const F144_AMOUNT_RULES = [AMOUNT_FOR_EACH_CARD_PUT_INTO_YOUR_GRAVEYARD];

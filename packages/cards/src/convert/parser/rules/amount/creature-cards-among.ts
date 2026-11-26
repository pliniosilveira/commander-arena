/**
 * Amount rule of the Exit from Exile deck (Journey to the Lost City): "for each creature card among those cards" after "exile the top four cards of your library" (CR 608.2c, 701.13).
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `amount.for-each-creature-card-among-those-cards`: the number of creature cards (a token is not a card) the exile before it exiled, which the engine counts as `thisWay`
 * `exiledCreatureCards`. The lowering refuses it unless the same text exiled before. Not read: another kind of card, "them", "the cards", a plural "cards" after "creature".
 */
export const AMOUNT_FOR_EACH_CREATURE_CARD_AMONG_THOSE_CARDS = defineRule<IrAmount>({
  id: 'amount.for-each-creature-card-among-those-cards',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.13 (Exile)'],
  examples: ['for each creature card among those cards'],
  rejects: [
    'for each land card among those cards',
    'for each creature card among them',
    'for each creature cards among those cards',
    'for each creature among those cards',
    'for each creature card among those',
    'for each creature card exiled this way',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/for each creature card among those cards(?![\p{L}\p{N}])/iu))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'thisWay',
        what: 'exiledCreatureCards',
        words: ['creature'],
        span: r.value.span,
      },
      pos: r.pos,
    };
  },
});

export const CREATURE_CARDS_AMONG_AMOUNT_RULES = [AMOUNT_FOR_EACH_CREATURE_CARD_AMONG_THOSE_CARDS];

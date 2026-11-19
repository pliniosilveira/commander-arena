/**
 * Amount rule of the Multiverse Reforged deck (issue 81, Occult Epiphany): the number of different card types among the cards a `discard` before it discarded.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.for-each-card-type-discarded`: "for each card type among cards discarded this way" (CR 205.2a, 608.2c: a card with two card types counts for both, and each type counts once
 * however many cards have it). The engine's `thisWay` `discardedTypeCount`, read after a `discard` of the same text. Not read: another verb, "card types among cards exiled this way",
 * "for each card type among the cards".
 */
export const AMOUNT_FOR_EACH_CARD_TYPE_DISCARDED = defineRule<IrAmount>({
  id: 'amount.for-each-card-type-discarded',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 205.2a (Card Types)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['for each card type among cards discarded this way'],
  rejects: [
    'for each card type among cards exiled this way',
    'for each card type among the cards discarded this way',
    'for each card type among cards discarded',
    'for each card type among cards that were discarded this way',
    'for each type among cards discarded this way',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each card type among cards discarded this way(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'thisWay',
        what: 'discardedTypeCount',
        words: ['card'],
        span: { start: pos, end: r.pos },
      },
      pos: r.pos,
    };
  },
});

/**
 * `amount.where-x-exiled-creatures` (issue 81, Sunfall): "where X is the number of creatures exiled this way" (CR 107.3c, 608.2c): the creatures an exile before it exiled, tokens included.
 * The engine's `thisWay` `exiledCreatures`. Not read: another kind of permanent, another verb, "the number of creatures exiled".
 */
export const AMOUNT_WHERE_X_EXILED_CREATURES = defineRule<IrAmount>({
  id: 'amount.where-x-exiled-creatures',
  family: 'amount',
  leading: ['where'],
  cites: ['CR 107.3c (Numbers and Symbols)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['where X is the number of creatures exiled this way'],
  rejects: [
    'where X is the number of creatures exiled',
    'where X is the number of lands exiled this way',
    'where X is the number of creatures destroyed this way',
    'where X is the number of creature exiled this way',
    'X is the number of creatures exiled this way',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/where X is the number of creatures exiled this way(?![\p{L}\p{N}])/u)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'thisWay',
        what: 'exiledCreatures',
        words: ['creature'],
        span: { start: pos, end: r.pos },
      },
      pos: r.pos,
    };
  },
});

export const DISCARDED_TYPES_AMOUNT_RULES = [
  AMOUNT_FOR_EACH_CARD_TYPE_DISCARDED,
  AMOUNT_WHERE_X_EXILED_CREATURES,
];

/**
 * Amounts of the card types among the cards of a zone (CR 205.2a: a card type is one of the words of the card type list, each counted once however many cards have it; a
 * supertype or a subtype is no card type): "the number of card types among cards in your graveyard" (Deluge of Doom's "where X is ...") and "for each card type among cards in
 * your graveyard" (Ursine Monstrosity). The engine's `cardTypesAmong`. The cards are the ones the count phrase names, a zone other than the battlefield.
 */
import { fail, literal, type Parser, pattern, sequence } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { counted } from './count';

/** `<head>card types among <cards in a zone>`: the plural group of cards of a zone, never of the battlefield. */
function cardTypesAmong(rule: string, head: string): Parser<IrAmount> {
  return (ctx, pos) => {
    const r = spanned(sequence(literal(head), counted(rule, true)))(ctx, pos);
    if (!r.ok) return r;
    const of = r.value.value[1];
    if (of.filter.card !== true) return fail(ctx, pos);
    return {
      ok: true,
      value: { kind: 'cardTypesAmong', of, span: r.value.span },
      pos: r.pos,
    };
  };
}

/** "the number of card types among cards in your graveyard", read after "where X is" and "equal to" (`amount/value.ts`). */
export const CARD_TYPES_AMONG_VALUE: Parser<IrAmount> = cardTypesAmong(
  'amount.where-x',
  'the number of card types among ',
);

/**
 * `amount.for-each-card-type`: "for each card type among cards in your graveyard" (CR 205.2a, 608.2c): how many card types the cards of a zone have between them. The engine's
 * `cardTypesAmong`, the count of "gets +1/+1 for each ...". Not read: "for each type", "for each card type" with no cards, "among permanents you control", "among cards on the
 * battlefield", "for each card type among the cards in your graveyard".
 */
export const AMOUNT_FOR_EACH_CARD_TYPE = defineRule<IrAmount>({
  id: 'amount.for-each-card-type',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 205.2a (Card Types)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'for each card type among cards in your graveyard',
    'for each card type among creature cards in your graveyard',
  ],
  rejects: [
    'for each card type',
    'for each type among cards in your graveyard',
    'for each card type among permanents you control',
    'for each card type among cards on the battlefield',
    'for each card type among the cards in your graveyard',
    'for each card types among cards in your graveyard',
  ],
  parse: cardTypesAmong('amount.for-each-card-type', 'for each card type among '),
});

/** `<head>card types among those cards`: the cards the batch trigger of the ability saw (CR 603.2c), never a zone. */
function cardTypesAmongThoseCards(head: string): Parser<IrAmount> {
  return (ctx, pos) => {
    const r = spanned(pattern(new RegExp(`${head} among those cards(?![\\p{L}\\p{N}])`, 'iu')))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'cardTypesAmongThoseCards', span: r.value.span },
      pos: r.pos,
    };
  };
}

/** "the number of card types among those cards", read after "where X is" and "equal to" (`amount/value.ts`). */
export const CARD_TYPES_AMONG_THOSE_VALUE: Parser<IrAmount> = cardTypesAmongThoseCards(
  'the number of card types',
);

/**
 * `amount.for-each-card-type-among-those-cards`: "for each card type among those cards" (CR 205.2a, 603.2c, 608.2c): how many card types the cards that caused a batch trigger have
 * between them (Polluted Cistern: "each opponent loses 1 life for each card type among those cards"). The engine's `cardTypesAmongTriggerCards`. Not read: "for each card type", "for
 * each type among those cards", "among the cards", "among that card", "among those creature cards".
 */
export const AMOUNT_FOR_EACH_CARD_TYPE_AMONG_THOSE_CARDS = defineRule<IrAmount>({
  id: 'amount.for-each-card-type-among-those-cards',
  family: 'amount',
  leading: ['for'],
  cites: [
    'CR 205.2a (Card Types)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['for each card type among those cards'],
  rejects: [
    'for each card type',
    'for each type among those cards',
    'for each card type among the cards',
    'for each card type among that card',
    'for each card type among those creature cards',
    'for each card types among those cards',
    'for each card type among those cards in your graveyard',
  ],
  parse: cardTypesAmongThoseCards('for each card type'),
});

export const CARD_TYPES_AMOUNT_RULES = [
  AMOUNT_FOR_EACH_CARD_TYPE,
  AMOUNT_FOR_EACH_CARD_TYPE_AMONG_THOSE_CARDS,
];

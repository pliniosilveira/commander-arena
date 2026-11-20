/**
 * "A deck can have up to nine cards named ~." (CR 100.2a, Nazgûl): a deck-construction line with no effect in a game. It is read as a keyword line so the card is supported; the
 * limit is checked by `packages/cards` when a deck is validated (`validate/deck.ts`), as the one of Partner is.
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { quantity } from '../amount';
import { defineRule, spanned } from '../registry';

/**
 * `keyword.deck-limit`: "A deck can have up to nine cards named ~", with the final period. A number of 2 or more, written in digits or in words. Not read: "any number of", a number
 * of 0 or 1, another subject than the card itself, "cards named" with another name, a second sentence on the line.
 */
export const KEYWORD_DECK_LIMIT = defineRule<readonly IrKeyword[]>({
  id: 'keyword.deck-limit',
  family: 'keyword',
  leading: ['a'],
  cites: ['CR 100.2a (Construction)', 'CR 903.5b (Commander Deck Construction)'],
  examples: [
    'A deck can have up to nine cards named ~.',
    'A deck can have up to seven cards named ~',
    'A deck can have up to 9 cards named ~.',
  ],
  rejects: [
    'A deck can have any number of cards named ~.',
    'A deck can have up to one cards named ~.',
    'A deck can have up to 1 cards named ~.',
    'A deck can have up to nine cards named Nazgûl.',
    'A deck can have up to nine cards.',
    'A deck can have up to nine cards named ~. Draw a card.',
    'A deck can have up to nine creatures named ~.',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      map(
        sequence(
          literal('A deck can have up to '),
          quantity,
          literal(' cards named ~'),
          pattern(/\.?(?![\p{L}\p{N}])/u),
        ),
        ([, limit]) => limit,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value: limit, span } = r.value;
    if (limit < 2) return fail(ctx, pos);
    const keyword: IrKeyword = {
      kind: 'keyword',
      name: 'deckLimit',
      params: [{ kind: 'number', value: limit, span }],
      span,
      rule: 'keyword.deck-limit',
    };
    return { ok: true, value: [keyword], pos: r.pos };
  },
});

export const DECK_LIMIT_KEYWORD_RULES = [KEYWORD_DECK_LIMIT];

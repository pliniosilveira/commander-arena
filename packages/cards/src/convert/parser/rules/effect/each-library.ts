/**
 * Effect rule of issue 279 (Etali, Primal Storm): "exile the top card of each player's library" (CR 701.13, 401: the top cards of every player's library are exiled, one player
 * after the other, face up). The engine's `exileTop` with `from` `eachPlayer`; the cards are what "those cards" names afterwards (`lower/dragons.ts`).
 */
import { choice, fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.exile-top-each-library`: "exile the top card of each player's library", "exile the top two cards of each player's library" (CR 701.13, 401.1). Not read: "target player's library" (`effect.exile-top-face-down`), your own library (`effect.exile-top`), "face down", a number of 0 or 1 in the plural, an instruction after it in
 * the same sentence.
 */
export const EFFECT_EXILE_TOP_EACH_LIBRARY = defineRule<Clauses>({
  id: 'effect.exile-top-each-library',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 101.4 (Players)'],
  examples: [
    "exile the top card of each player's library",
    'exile the top card of each player’s library',
    "exile the top two cards of each player's library",
    // Exit from Exile deck (Stolen Strategy): the library of every opponent.
    "exile the top card of each opponent's library",
  ],
  rejects: [
    "exile the top card of each other opponent's library",
    "exile the top card of target player's library",
    'exile the top card of your library',
    "exile the top card of each player's library face down",
    "exile the top one cards of each player's library",
    "exile the top two card of each player's library",
    "exile the top cards of each player's library",
    "exile the top card of each player's graveyard",
    "exile the top card of each player's library and draw a card",
    "exile top card of each player's library",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-top-each-library';
    const head = literal('exile the top ')(ctx, pos);
    if (!head.ok) return head;
    const counted = spanned(
      choice<number>(
        map(pattern(new RegExp(`card${BOUNDARY}`, 'iu')), () => 1),
        map(
          sequence(
            satisfy(quantity, (n) => n >= 2),
            pattern(new RegExp(` cards${BOUNDARY}`, 'iu')),
          ),
          ([n]) => n,
        ),
      ),
    )(ctx, head.pos);
    if (!counted.ok) return counted;
    const owner = sequence(
      literal(' of '),
      family<IrNoun>('noun', { only: ['noun.player'] }),
      pattern(/['’]s library(?![\p{L}\p{N}])(?! face down)/iu),
    )(ctx, counted.pos);
    if (!owner.ok) return owner;
    const [, who] = owner.value;
    // "each player" or (Stolen Strategy) "each opponent": not "you", not "target player".
    if (who.det !== 'eachPlayer' && who.det !== 'eachOpponent') return fail(ctx, pos);
    const { value, span } = counted.value;
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'exileTop',
          { count: { kind: 'number', value, span }, from: who },
          { start: pos, end: owner.pos },
        ),
      ],
      pos: owner.pos,
    };
  },
});

export const EACH_LIBRARY_EFFECT_RULES = [quietly(EFFECT_EXILE_TOP_EACH_LIBRARY)];

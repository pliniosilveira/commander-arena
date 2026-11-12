/**
 * Conditions of the Niv-Mizzet deck program, group 2b-a (issue 25, D-940): the number of cards in the library of the controller (CR 401.1: a library is a
 * zone of cards). "There are no cards in your library" and "your library has no cards in it" are one condition, the engine's `cardsInLibrary`, which reads
 * the library of the controller and no characteristic, so a static ability of layer 4 or 7b may have it, and the `while` of a replacement of a draw too.
 */
import { fail, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrComparison, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';

const COUNT: Parser<number> = satisfy(quantity, (n) => n >= 1);

/** "no cards" is at most 0; "fewer than eight cards" is at most 7 (a number below two is not how a card says it). */
const COMPARE: Parser<IrComparison> = (ctx, pos) => {
  const none = pattern(/no(?= cards)/iu)(ctx, pos);
  if (none.ok) return { ok: true, value: { cmp: 'atMost', value: 0 }, pos: none.pos };
  const head = pattern(/fewer than /iu)(ctx, pos);
  if (!head.ok) return head;
  const n = COUNT(ctx, head.pos);
  if (!n.ok) return n;
  return n.value < 2
    ? fail(ctx, pos)
    : { ok: true, value: { cmp: 'atMost', value: n.value - 1 }, pos: n.pos };
};

/**
 * `condition.cards-in-library`: "there are no cards in your library", "there are fewer than three cards in your library", "your library has no cards in it",
 * "your library has fewer than three cards in it" (CR 401.1: the cards in the library of the controller). The engine's `cardsInLibrary`. Not read: a kind of
 * card ("creature cards"), another player's library, "at least" or "N or more" (an amount comparison that a static ability of layer 4 may not read), a
 * number of one with "fewer than", a missing "there are", "has" with "there".
 */
export const CONDITION_CARDS_IN_LIBRARY = quietly(
  defineRule<IrCondition>({
    id: 'condition.cards-in-library',
    family: 'condition',
    leading: ['there', 'your'],
    cites: [
      'CR 401.1 (Library)',
      'CR 611.3a (Continuous Effects)',
      'CR 614.11 (Replacement Effects)',
    ],
    examples: [
      'there are no cards in your library',
      'there are fewer than three cards in your library',
      'there are fewer than 3 cards in your library',
      'your library has no cards in it',
      'your library has fewer than three cards in it',
    ],
    rejects: [
      'there are no creature cards in your library',
      "there are no cards in an opponent's library",
      'there are no cards in a library',
      'there are no cards in your graveyard',
      'there are at least three cards in your library',
      'there are three or more cards in your library',
      'there are fewer than one cards in your library',
      'there are fewer than three cards in your library.',
      'there is no card in your library',
      'your library has no cards',
      'your library has no cards in it.',
      'your library has no creature cards in it',
      "an opponent's library has no cards in it",
      'your library has three or more cards in it',
      'your library has at least three cards in it',
      'you have no cards in your library',
    ],
    parse: (ctx, pos) => {
      const there = sequence(
        pattern(/there are /iu),
        COMPARE,
        pattern(new RegExp(` cards in your library${BOUNDARY}`, 'iu')),
      )(ctx, pos);
      const has = there.ok
        ? there
        : sequence(
            pattern(/your library has /iu),
            COMPARE,
            pattern(new RegExp(` cards in it${BOUNDARY}`, 'iu')),
          )(ctx, pos);
      if (!has.ok) return has;
      const [, compare] = has.value;
      return {
        ok: true,
        value: {
          kind: 'condition',
          test: { kind: 'cardsInLibrary', compare },
          span: { start: pos, end: has.pos },
          rule: 'condition.cards-in-library',
        },
        pos: has.pos,
      };
    },
  }),
);

export const LIBRARY_CONDITION_RULES = [CONDITION_CARDS_IN_LIBRARY];

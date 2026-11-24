/**
 * Effect rules of group E of the Counter Blitz deck (Scholar of New Horizons):
 *
 * - `effect.search-reveal-may-put-else-hand`: "Search your library for a Plains card and reveal it. If an opponent controls more lands than you, you may put that card onto the
 *   battlefield tapped. If you don't put the card onto the battlefield, put it into your hand. Then shuffle."
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrCondition, IrFlag, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const RULE = 'effect.search-reveal-may-put-else-hand';

/**
 * `effect.search-reveal-may-put-else-hand` (CR 701.23 Search, 701.20 Reveal, 608.2c, 608.2d, 701.24 Shuffle): four sentences that are one instruction (kept together by `splitSentences`):
 * the search for one card of a kind, revealed; a condition about the opponents ("an opponent controls more lands than you") under which the player may put the card onto the battlefield
 * (tapped or not); where the card goes otherwise, the hand; and the shuffle. The engine's `search` with `mayPut`, read after the search and the reveal and before the shuffle. Not read: a
 * condition other than `condition.opponent-has-more`, a plural or counted noun, another place for the card or for the fallback, no reveal, no shuffle, another player's library, a
 * "may" search.
 */
export const EFFECT_SEARCH_REVEAL_MAY_PUT_ELSE_HAND = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['search'],
  cites: [
    'CR 701.23a (Search)',
    'CR 701.23b (Search)',
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.24a (Shuffle)',
  ],
  examples: [
    "search your library for a Plains card and reveal it. if an opponent controls more lands than you, you may put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand. then shuffle",
    'Search your library for a basic land card and reveal it. If an opponent controls more lands than you, you may put that card onto the battlefield. If you don’t put the card onto the battlefield, put it into your hand. Then shuffle',
    "search your library for a Forest card and reveal it. if an opponent has more life than you, you may put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand. then shuffle",
  ],
  rejects: [
    "search your library for a Plains card and reveal it. if an opponent controls more lands than you, you may put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand",
    "search your library for a Plains card. if an opponent controls more lands than you, you may put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand. then shuffle",
    "search your library for a Plains card and reveal it. if an opponent controls more lands than you, put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand. then shuffle",
    "search your library for a Plains card and reveal it. if an opponent controls more lands than you, you may put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it on top of your library. then shuffle",
    "search your library for a Plains card and reveal it. if an opponent controls more lands than you, you may put that card into your hand. if you don't put the card onto the battlefield, put it into your hand. then shuffle",
    "search your library for two Plains cards and reveal them. if an opponent controls more lands than you, you may put them onto the battlefield tapped. if you don't put the cards onto the battlefield, put them into your hand. then shuffle",
    "search your library for a Plains card and reveal it. if you control a creature, you may put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand. then shuffle",
    "search their library for a Plains card and reveal it. if an opponent controls more lands than you, you may put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand. then shuffle",
    "search your library for a Plains card and reveal it. if an opponent controls more lands than you, you may put that card onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand. then shuffle.",
  ],
  parse: single(
    RULE,
    (ctx, pos) => {
      const head = sequence(
        literal('search your library for '),
        satisfy(family<IrNoun>('noun', { only: ['noun.library-card'] }), (noun) => !noun.plural),
        pattern(/ and reveal it\. if /iu),
        family<IrCondition>('condition', { only: ['condition.opponent-has-more'] }),
        pattern(/, you may put that card onto the battlefield( tapped)?\. /iu),
      )(ctx, pos);
      if (!head.ok) return head;
      const [, cards, , condition, put] = head.value;
      if (condition.test.kind !== 'amountIs') return fail(ctx, pos);
      const tail = spanned(
        pattern(
          new RegExp(
            `if you don['’]t put the card onto the battlefield, put it into your hand\\. then shuffle${BOUNDARY}`,
            'iu',
          ),
        ),
      )(ctx, head.pos);
      if (!tail.ok) return tail;
      const tapped: IrFlag = {
        kind: 'flag',
        value: (put[1] ?? '') !== '',
        span: { start: pos, end: head.pos },
        rule: RULE,
      };
      return {
        ok: true,
        value: { cards, amount: condition.test.amount, tapped },
        pos: tail.pos,
      };
    },
    ({ cards, amount, tapped }: { cards: IrNoun; amount: IrAmount; tapped: IrFlag }) => ({
      verb: 'searchMayPut',
      args: { cards, opponentsMore: amount, tapped },
    }),
  ),
});

export const COUNTER_BLITZ_E_EFFECT_RULES = [EFFECT_SEARCH_REVEAL_MAY_PUT_ELSE_HAND];

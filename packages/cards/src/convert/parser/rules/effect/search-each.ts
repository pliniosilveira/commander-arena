/**
 * Effect rule of the Hosts of Mordor deck (Field of Ruin): "Each player searches their library for a basic land card, puts it onto the battlefield, then shuffles." (CR 701.23a: each
 * player the effect names searches their own library; CR 701.24 shuffle; CR 110.2a: the card enters under the control of the player who put it there). Said of each player or
 * each opponent, with one card put onto the battlefield (tapped or not) and a shuffle; the searchers are not asked ("may" is the other rule, `effect.search-by`).
 */
import { choice, fail, literal, pattern, sequence } from '../../combinators';
import type { IrDestinationList, IrFlag, IrNoun, IrZoneSpec } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.search-each';

export const EFFECT_SEARCH_EACH = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.23a (Search)',
    'CR 701.23b (Search)',
    'CR 701.24 (Shuffle)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'each player searches their library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player searches their library for a basic land card, puts that card onto the battlefield tapped, then shuffles',
    'each opponent searches their library for a Forest card, puts it onto the battlefield, then shuffles',
  ],
  rejects: [
    'each player searches their library for a basic land card, puts it onto the battlefield',
    'each player searches their library for a basic land card, puts it into their hand, then shuffles',
    'each player searches their library for a basic land card, puts them onto the battlefield, then shuffles',
    'each player searches their library for up to two basic land cards, puts them onto the battlefield, then shuffles',
    'each player searches your library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player searches their library for a basic land card, reveals it, puts it onto the battlefield, then shuffles',
    'each player search their library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player searches their library for a basic land card, puts it onto the battlefield, then shuffle',
    'target player searches their library for a basic land card, puts it onto the battlefield, then shuffles',
  ],
  parse: single(
    ID,
    (ctx, pos) => {
      const head = sequence(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        spanned(literal(' searches their library for ')),
        family<IrNoun>('noun', { only: ['noun.library-card'] }),
      )(ctx, pos);
      if (!head.ok) return head;
      const [player, , cards] = head.value;
      if (cards.plural || (player.det !== 'eachPlayer' && player.det !== 'eachOpponent')) {
        return fail(ctx, pos);
      }
      const put = spanned(
        sequence(
          literal(', puts '),
          choice(literal('that card'), literal('it')),
          literal(' '),
          pattern(/onto the battlefield(?: tapped)?/i),
        ),
      )(ctx, head.pos);
      if (!put.ok) return put;
      const shuffled = spanned(literal(', then shuffles'))(ctx, put.pos);
      if (!shuffled.ok) return shuffled;
      const tapped = put.value.value[3][0].toLowerCase().endsWith('tapped');
      const zone: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'battlefield',
        ...(tapped ? { tapped: true } : {}),
        count: 1,
        span: put.value.span,
        rule: ID,
      };
      const destinations: IrDestinationList = {
        kind: 'destinations',
        items: [zone],
        span: put.value.span,
        rule: ID,
      };
      const flag = (value: boolean, span: IrFlag['span']): IrFlag => ({
        kind: 'flag',
        value,
        span,
        rule: ID,
      });
      return {
        ok: true,
        value: {
          player,
          cards,
          destinations,
          reveal: flag(false, { start: put.pos, end: put.pos }),
          shuffle: flag(true, shuffled.value.span),
        },
        pos: shuffled.pos,
      };
    },
    ({ player, cards, destinations, reveal, shuffle }) => ({
      verb: 'search',
      args: { player, cards, destinations, reveal, shuffle },
    }),
  ),
});

export const SEARCH_EACH_RULES = [EFFECT_SEARCH_EACH];

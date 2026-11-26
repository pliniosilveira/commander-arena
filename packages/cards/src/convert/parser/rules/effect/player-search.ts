/**
 * The player verb of a search made by a player other than the one who controls the effect (Riders of Rohan deck, group B; Field of Ruin; CR 701.23a, 701.24, 110.2a): "each player
 * searches their library for a basic land card, puts it onto the battlefield, then shuffles". The whole sentence is one instruction with one noun, as `effect.search` reads it for "you";
 * the words that point back at the card found ("it", "that card") agree with the noun, which is one card. Said of the players the subject names, each of whom searches their own
 * library: the engine's `search` with that player (a "may" is `effect.search-by`'s). Not read: "you" (the imperative `effect.search`), several cards, a reveal, another place than the
 * battlefield, no shuffle, a "may".
 */

import type { Parser } from '../../combinators';
import { choice, fail, literal, pattern, sequence } from '../../combinators';
import type { IrClause, IrDestinationList, IrFlag, IrNoun, IrZoneSpec } from '../../ir/types';
import { family, spanned } from '../registry';
import { makeClause } from './operands';

/** The shape of a player verb of `effect.player` (the same as its `Action`, which this file cannot import without a cycle). */
type Action = (subject: IrNoun, you: boolean, rule: string) => Parser<IrClause>;

/** "searches their library for a basic land card, puts it onto the battlefield[ tapped], then shuffles": one card, each searching player puts it onto the battlefield, then shuffles. */
export const playerSearchAction: Action = (subject, you, rule) =>
  you
    ? (ctx, pos) => fail(ctx, pos)
    : (ctx, pos) => {
        const head = sequence(
          literal('searches their library for '),
          family<IrNoun>('noun', { only: ['noun.library-card'] }),
        )(ctx, pos);
        if (!head.ok) return head;
        const cards = head.value[1];
        if (cards.plural) return fail(ctx, pos);
        const put = spanned(
          sequence(
            literal(', puts '),
            choice(literal('that card'), literal('it')),
            literal(' '),
            pattern(/onto the battlefield(?: tapped)?(?![\p{L}\p{N}])/iu),
          ),
        )(ctx, head.pos);
        if (!put.ok) return put;
        const tapped = put.value.value[3][0].toLowerCase().endsWith('tapped');
        const shuffled = spanned(literal(', then shuffles'))(ctx, put.pos);
        if (!shuffled.ok) return shuffled;
        const zone: IrZoneSpec = {
          kind: 'zoneSpec',
          zone: 'battlefield',
          ...(tapped ? { tapped: true } : {}),
          count: 1,
          span: put.value.span,
          rule,
        };
        const destinations: IrDestinationList = {
          kind: 'destinations',
          items: [zone],
          span: put.value.span,
          rule,
        };
        const flag = (value: boolean, span: { start: number; end: number }): IrFlag => ({
          kind: 'flag',
          value,
          span,
          rule,
        });
        const clause = makeClause(
          rule,
          'search',
          {
            player: subject,
            cards,
            destinations,
            reveal: flag(false, { start: head.pos, end: head.pos }),
            shuffle: flag(true, shuffled.value.span),
          },
          { start: pos, end: shuffled.pos },
        );
        return { ok: true, value: clause, pos: shuffled.pos };
      };

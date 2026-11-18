/**
 * Effect rule of issue 226 (Krosan Verge): "Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle." (CR 701.23 search, 701.24
 * shuffle). One search with a card of each of two kinds: the player looks through the library once, finds at most one card of each kind and puts them both onto the battlefield.
 * The engine runs it as two searches, the second one shuffling (nothing happens between them, so the cards that can be found and the order of the library are the same).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrDestinationList, IrFlag, IrNoun, IrZoneSpec } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.search-pair';

/**
 * `effect.search-pair`: two single-card nouns joined by "and", both put onto the battlefield (tapped or not), then a shuffle. Not read: a shared "up to two" noun (that is
 * `effect.search`), a reveal, another destination, a missing shuffle, or a third card.
 */
export const EFFECT_SEARCH_PAIR = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['search'],
  cites: [
    'CR 701.23 (Search)',
    'CR 701.23b (Search)',
    'CR 701.24 (Shuffle)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle',
    'search your library for a Forest card and a Plains card, put them onto the battlefield, then shuffle',
  ],
  rejects: [
    'search your library for a Forest card and a Plains card, put them onto the battlefield tapped',
    'search your library for a Forest card and a Plains card, reveal them, put them onto the battlefield tapped, then shuffle',
    'search your library for a Forest card and a Plains card, put them into your hand, then shuffle',
    'search your library for a Forest card and a Plains card, put it onto the battlefield tapped, then shuffle',
    'search your library for a Forest card, a Plains card and an Island card, put them onto the battlefield tapped, then shuffle',
    'search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle',
    'search their library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle',
  ],
  parse: single(
    ID,
    (ctx, pos) => {
      const head = sequence(
        literal('search your library for '),
        family<IrNoun>('noun', { only: ['noun.library-card'] }),
        literal(' and '),
        family<IrNoun>('noun', { only: ['noun.library-card'] }),
      )(ctx, pos);
      if (!head.ok) return head;
      const [, first, , second] = head.value;
      if (first.plural || second.plural) return fail(ctx, pos);
      const put = spanned(
        sequence(literal(', put them '), pattern(/onto the battlefield(?: tapped)?/i)),
      )(ctx, head.pos);
      if (!put.ok) return put;
      const tapped = put.value.value[1][0].toLowerCase().endsWith('tapped');
      const shuffled = spanned(pattern(/, then shuffle(?: your library)?/i))(ctx, put.pos);
      if (!shuffled.ok) return shuffled;
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
      const shuffle: IrFlag = { kind: 'flag', value: true, span: shuffled.value.span, rule: ID };
      return { ok: true, value: { first, second, destinations, shuffle }, pos: shuffled.pos };
    },
    ({ first, second, destinations, shuffle }) => ({
      verb: 'searchPair',
      args: { cards: first, cards2: second, destinations, shuffle },
    }),
  ),
});

export const SEARCH_PAIR_RULES = [EFFECT_SEARCH_PAIR].map(quietly);

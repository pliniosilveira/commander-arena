/**
 * `effect.search`: "Search your library for a basic land card, put it onto the battlefield tapped,
 * then shuffle." and its relatives (CR 701.23 search, 701.20 reveal, 701.24 shuffle). The whole
 * sentence is one instruction with one noun, so the words that point back at the found cards ("it",
 * "that card", "those cards", "them", "one ... and the other") are read here against that noun and
 * agree with its number; they are not left to the binding pass, which would have to guess. A
 * search for a plural noun puts every card at one place ("put them onto the battlefield") or, for
 * "up to two", splits them ("put one onto the battlefield tapped and the other into your hand").
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrDestinationList, IrFlag, IrNoun, IrZoneSpec, Span } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const NOUN = 'noun.library-card';

type Place = Pick<IrZoneSpec, 'zone' | 'whose' | 'tapped'>;

/** Where a found card goes: the battlefield, your hand or your graveyard (CR 701.23; the top of the library is read in `tailFor`). */
const PLACE: Parser<Place> = choice<Place>(
  map(literal('onto the battlefield tapped'), () => ({ zone: 'battlefield', tapped: true })),
  map(literal('onto the battlefield'), () => ({ zone: 'battlefield' })),
  map(literal('into your hand'), () => ({ zone: 'hand', whose: 'you' })),
  map(literal('into your graveyard'), () => ({ zone: 'graveyard', whose: 'you' })),
);

/**
 * Where a card another player found goes: the battlefield, tapped or not. Their hand and
 * graveyard are "their" hand and graveyard, which no rule reads yet.
 */
const THEIR_PLACE: Parser<Place> = choice<Place>(
  map(literal('onto the battlefield tapped'), () => ({ zone: 'battlefield', tapped: true })),
  map(literal('onto the battlefield'), () => ({ zone: 'battlefield' })),
);

/** What the found cards are called after the search: agrees with the noun's number. */
const referTo = (plural: boolean): Parser<string> =>
  plural
    ? choice(literal('those cards'), literal('them'))
    : choice(literal('that card'), literal('it'));

const RULE = 'effect.search';

function flag(value: boolean, span: Span): IrFlag {
  return { kind: 'flag', value, span, rule: RULE };
}

interface Tail {
  readonly reveal: IrFlag;
  readonly destinations: IrDestinationList;
  readonly shuffle: IrFlag;
}

/**
 * The part after the noun: an optional reveal, the put, an optional shuffle. `yours` is false when
 * another player searches: they put the card onto the battlefield and nothing is revealed.
 */
function tailFor(cards: IrNoun, yours = true): Parser<Tail> {
  const plural = cards.plural;
  const max = cards.count?.kind === 'number' ? cards.count.value : 1;
  const zone = (place: Place, span: Span, count: number): IrZoneSpec => ({
    kind: 'zoneSpec',
    ...place,
    count,
    span,
    rule: RULE,
  });
  const where = map(spanned(yours ? PLACE : THEIR_PLACE), ({ value, span }) => ({
    place: value,
    span,
  }));
  const all = map(sequence(referTo(plural), literal(' '), where), ([, , w]): IrZoneSpec[] => [
    zone(w.place, w.span, max),
  ]);
  // "put one onto A and the other into B" is two cards, so it needs a search for up to two.
  const split = map(
    sequence(literal('one '), where, literal(' and the other '), where),
    ([, a, , b]): IrZoneSpec[] => [zone(a.place, a.span, 1), zone(b.place, b.span, 1)],
  );
  const put = plural && max === 2 ? choice(split, all) : all;
  return (ctx, pos) => {
    // Another player's search reveals nothing: ", reveal" is not read, so the put fails on it.
    const reveal = yours
      ? map(
          spanned(sequence(literal(', reveal '), referTo(plural))),
          ({ span }): IrFlag => flag(true, span),
        )(ctx, pos)
      : fail(ctx, pos);
    const afterReveal = reveal.ok ? reveal.pos : pos;
    const revealFlag = reveal.ok ? reveal.value : flag(false, { start: pos, end: pos });
    // D-1250 (CR 701.24b): "then shuffle and put that card on top" is the put and the shuffle in one: the card found is left out of the shuffle and put on top of
    // the library afterwards. One card only ("put them on top" would need an order).
    const onTop =
      yours && !plural
        ? spanned(
            sequence(
              pattern(/,? then shuffle and put /i),
              choice(referTo(false), literal('the card')),
              literal(' on top'),
              optional(literal(' of your library'), ''),
            ),
          )(ctx, afterReveal)
        : fail(ctx, afterReveal);
    if (onTop.ok) {
      const { span } = onTop.value;
      return {
        ok: true,
        value: {
          reveal: revealFlag,
          destinations: {
            kind: 'destinations',
            items: [{ ...zone({ zone: 'library', whose: 'you' }, span, max), position: 'top' }],
            span,
            rule: RULE,
          },
          shuffle: flag(true, span),
        },
        pos: onTop.pos,
      };
    }
    const placed = spanned(sequence(literal(', put '), put))(ctx, afterReveal);
    if (!placed.ok) return placed;
    const items = placed.value.value[1];
    const destinations: IrDestinationList = {
      kind: 'destinations',
      items,
      span: placed.value.span,
      rule: RULE,
    };
    const shuffled = spanned(pattern(/, then shuffle(?: your library)?/i))(ctx, placed.pos);
    const shuffle = shuffled.ok
      ? flag(true, shuffled.value.span)
      : flag(false, { start: placed.pos, end: placed.pos });
    return {
      ok: true,
      value: { reveal: revealFlag, destinations, shuffle },
      pos: shuffled.ok ? shuffled.pos : placed.pos,
    };
  };
}

export const EFFECT_SEARCH = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['search'],
  cites: ['CR 701.23 (Search)', 'CR 701.23b (Search)', 'CR 701.20 (Reveal)', 'CR 701.24 (Shuffle)'],
  examples: [
    'search your library for a basic land card, put it onto the battlefield tapped, then shuffle',
    'search your library for a basic land card, put that card onto the battlefield tapped, then shuffle',
    'search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle',
    'search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle',
    'search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle',
    'search your library for a Forest card, put that card onto the battlefield, then shuffle',
    'search your library for a creature card, reveal it, put it into your hand, then shuffle',
    'search your library for a card, put that card into your hand, then shuffle',
    'search your library for a card, put that card into your graveyard, then shuffle',
    'search your library for an artifact card, reveal that card, put it into your hand, then shuffle',
    'search your library for a basic land card, put it into your hand',
    // D-1250 (CR 701.24b): the found card is left out of the shuffle and put on top.
    'search your library for an enchantment card, reveal it, then shuffle and put that card on top',
    'search your library for an instant or sorcery card, reveal it, then shuffle and put it on top of your library',
    'search your library for a card, then shuffle and put that card on top',
    'search your library for an artifact card, reveal that card, then shuffle and put the card on top',
  ],
  rejects: [
    'search your library for a basic land card, put them onto the battlefield tapped, then shuffle',
    'search your library for a card, put it on top of your library, then shuffle',
    'search your library for up to two cards, reveal them, then shuffle and put them on top',
    'search your library for a card, reveal it, then shuffle and put it on the bottom',
    'search your library for a card, reveal it, then shuffle and put those cards on top',
    'search your library for a card, reveal it, then shuffle it and put that card on top',
    'search your library for a basic land card, put it onto the battlefield tapped, then shuffle it',
    'search your library for a card, put it into your hand, discard a card at random, then shuffle',
    'search your library for up to three basic land cards, put one onto the battlefield and the other into your hand, then shuffle',
    'search your library for a basic land card and put it onto the battlefield tapped, then shuffle',
    'search their library for a basic land card, put it onto the battlefield, then shuffle',
    'search your library for a creature card with mana value 3 or less, put it onto the battlefield, then shuffle',
    'search your library for a card, reveal those cards, put it into your hand, then shuffle',
  ],
  parse: single(
    RULE,
    (ctx, pos) => {
      const head = sequence(
        literal('search your library for '),
        family<IrNoun>('noun', { only: [NOUN] }),
      )(ctx, pos);
      if (!head.ok) return head;
      const cards = head.value[1];
      const tail = tailFor(cards)(ctx, head.pos);
      if (!tail.ok) return tail;
      return { ok: true, value: { cards, ...tail.value }, pos: tail.pos };
    },
    ({ cards, reveal, destinations, shuffle }) => ({
      verb: 'search',
      args: { cards, destinations, reveal, shuffle },
    }),
  ),
});

/**
 * `effect.search-by`: "Its controller may search their library for a basic land card, put that
 * card onto the battlefield tapped, then shuffle." (CR 701.23a: the player who searches is the one
 * the effect names; CR 608.2d: a "may" is that player's choice, made as the effect resolves; CR
 * 110.2a: the card enters under the control of the player who put it there). Said of the controller
 * of an earlier object, of one card, put onto the battlefield: that is what the engine's tests run.
 * The subject is the pronoun phrase, read by `noun.its-controller` and bound like any other.
 */
export const EFFECT_SEARCH_BY = defineRule<Clauses>({
  id: 'effect.search-by',
  family: 'effect',
  leading: ['its', 'that'],
  cites: [
    'CR 701.23a (Search)',
    'CR 701.23b (Search)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
    'CR 701.24 (Shuffle)',
  ],
  examples: [
    'its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle',
    'its controller may search their library for a basic land card, put it onto the battlefield, then shuffle',
    "that land's controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle",
    'its controller may search their library for a Forest card, put that card onto the battlefield, then shuffle',
  ],
  rejects: [
    'its controller searches their library for a basic land card, put it onto the battlefield, then shuffle',
    'its controller may search your library for a basic land card, put it onto the battlefield, then shuffle',
    'its controller may search their library for a basic land card, reveal it, put it onto the battlefield, then shuffle',
    'its controller may search their library for a basic land card, put it into their hand, then shuffle',
    'its controller may search their library for up to two basic land cards, put them onto the battlefield tapped, then shuffle',
    'its controller may search their library for a basic land card, put them onto the battlefield, then shuffle',
    'its owner may search their library for a basic land card, put it onto the battlefield, then shuffle',
    'target player may search their library for a basic land card, put it onto the battlefield, then shuffle',
    'you may search their library for a basic land card, put it onto the battlefield, then shuffle',
    'its controller may search their library for a basic land card',
  ],
  parse: single(
    'effect.search-by',
    (ctx, pos) => {
      const head = sequence(
        family<IrNoun>('noun', { only: ['noun.its-controller'] }),
        spanned(literal(' may search their library for ')),
        satisfy(family<IrNoun>('noun', { only: [NOUN] }), (noun) => !noun.plural),
      )(ctx, pos);
      if (!head.ok) return head;
      const [player, may, cards] = head.value;
      const tail = tailFor(cards, false)(ctx, head.pos);
      if (!tail.ok) return tail;
      return { ok: true, value: { player, may, cards, ...tail.value }, pos: tail.pos };
    },
    ({ player, may, cards, reveal, destinations, shuffle }) => ({
      verb: 'search',
      args: { player, may: flag(true, may.span), cards, destinations, reveal, shuffle },
    }),
  ),
});

export const SEARCH_RULES = [EFFECT_SEARCH, EFFECT_SEARCH_BY];

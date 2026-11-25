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
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrDestinationList, IrFlag, IrNoun, IrZoneSpec, Span } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const NOUN = 'noun.library-card';
/** CR 701.23b: "four basic land cards", a count with a stated quality, is read for the search only. */
const COUNTED = 'noun.library-cards-counted';
/** Finale of Devastation: "a creature card with mana value X or less", tried first: the plain noun would read "a creature card" and leave the rest. */
const MV_X = 'noun.library-card-mana-value-x';

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

/** "search your library for " and, for issue 104 (CR 701.23a), "search your graveyard, hand, and/or library for ": two or three of the zones, "and/or" before the last. */
const ZONE_WORD = '(?:graveyard|hand|library)';
const WHERE = new RegExp(
  `search your (library|${ZONE_WORD}(?:, ${ZONE_WORD})?,? and/or ${ZONE_WORD}) for `,
  'iu',
);

/** The zones said, as the list the lowering reads; null for the library alone, 'bad' for a zone said twice or the wrong punctuation ("graveyard and/or hand and/or library"). */
function zonesOf(words: string, span: Span): IrDestinationList | null | 'bad' {
  if (words.toLowerCase() === 'library') return null;
  const names = words.toLowerCase().split(/, and\/or |,? and\/or |, /u);
  const three = names.length === 3;
  // "A and/or B" (two) or "A, B, and/or C" (three, with the comma before "and/or", as Oracle text writes a list).
  if (three ? !/^[a-z]+, [a-z]+, and\/or [a-z]+$/u.test(words.toLowerCase()) : names.length !== 2) {
    return 'bad';
  }
  if (new Set(names).size !== names.length) return 'bad';
  const items = names.map(
    (zone): IrZoneSpec => ({
      kind: 'zoneSpec',
      zone: zone as 'graveyard' | 'hand' | 'library',
      whose: 'you',
      span,
      rule: RULE,
    }),
  );
  return { kind: 'destinations', items, span, rule: RULE };
}

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
 * another player searches: they put the card onto the battlefield and nothing is revealed. `newSentence` (Oreskos Explorer, CR 107.3c): the reveal may open a sentence of its own after
 * the definition of X ("..., where X is the number of players who control more lands than you. Reveal those cards, put them into your hand, then shuffle.").
 */
function tailFor(cards: IrNoun, yours = true, newSentence = false): Parser<Tail> {
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
          spanned(
            sequence(
              newSentence
                ? choice(
                    map(pattern(/\. reveal /i), (m) => m[0]),
                    literal(', reveal '),
                  )
                : literal(', reveal '),
              referTo(plural),
            ),
          ),
          ({ span }): IrFlag => flag(true, span),
        )(ctx, pos)
      : fail(ctx, pos);
    const afterReveal = reveal.ok ? reveal.pos : pos;
    const revealFlag = reveal.ok ? reveal.value : flag(false, { start: pos, end: pos });
    // D-405 (CR 701.24b): "then shuffle and put that card on top" is the put and the shuffle in one: the card found is left out of the shuffle and put on top of
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
    if (!placed.ok) {
      // Lorehold group 1 (CR 701.23): "search your library for a Plains card and put it onto the battlefield tapped": one card put at once, with no reveal and no shuffle in the same
      // sentence (a shuffle after it is a sentence of its own: "If you search your library this way, shuffle.").
      const andPut =
        yours && !plural && !reveal.ok
          ? spanned(sequence(literal(' and put '), all))(ctx, afterReveal)
          : fail(ctx, afterReveal);
      if (!andPut.ok) return placed;
      const [, zones] = andPut.value.value;
      return {
        ok: true,
        value: {
          reveal: revealFlag,
          destinations: {
            kind: 'destinations',
            items: zones,
            span: andPut.value.span,
            rule: RULE,
          },
          shuffle: flag(false, { start: andPut.pos, end: andPut.pos }),
        },
        pos: andPut.pos,
      };
    }
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
    // CR 701.23b (Planar Engineering): a count of cards with a stated quality, put at once.
    'search your library for four basic land cards, put them onto the battlefield tapped, then shuffle',
    'search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle',
    'search your library for a Forest card, put that card onto the battlefield, then shuffle',
    'search your library for a creature card, reveal it, put it into your hand, then shuffle',
    'search your library for a card, put that card into your hand, then shuffle',
    'search your library for a card, put that card into your graveyard, then shuffle',
    'search your library for an artifact card, reveal that card, put it into your hand, then shuffle',
    'search your library for a basic land card, put it into your hand',
    // Lorehold group 1 (Claim Jumper): the put is joined with "and", and a shuffle is another sentence.
    'search your library for a Plains card and put it onto the battlefield tapped',
    'search your library for a basic land card and put it into your hand',
    // D-405 (CR 701.24b): the found card is left out of the shuffle and put on top.
    'search your library for an enchantment card, reveal it, then shuffle and put that card on top',
    'search your library for an instant or sorcery card, reveal it, then shuffle and put it on top of your library',
    'search your library for a card, then shuffle and put that card on top',
    // CR 701.23, 202.3: any number of cards with a total mana value, put at once, with the shuffle in the same sentence.
    'search your library for any number of creature cards with total mana value 6 or less, put them onto the battlefield, then shuffle',
    'search your library for any number of nonland permanent cards with total mana value 4 or less, put them onto the battlefield tapped, then shuffle',
    // Issue 160 (D-626): "up to X", with X defined right after the noun.
    'search your library for up to X basic land cards, where X is the number of tapped creatures you control, put those cards onto the battlefield tapped, then shuffle',
    // Oreskos Explorer (CR 107.3c, 701.23): the reveal is a sentence of its own after the definition of X.
    'search your library for up to X Plains cards, where X is the number of players who control more lands than you. Reveal those cards, put them into your hand, then shuffle',
    'search your library for up to X Plains cards, where X is the number of tapped creatures you control, reveal them, put them into your hand, then shuffle',
    'search your library for an artifact card, reveal that card, then shuffle and put the card on top',
    // Issue 104 (Gate to the Afterlife, CR 701.23a): several zones of the searcher, and a card of a given name.
    "search your graveyard, hand, and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield",
    'search your hand and/or library for a creature card and put it onto the battlefield',
    'search your graveyard, hand, and/or library for a creature card and put it into your hand',
    // Finale of Devastation (CR 107.3a, 202.3): the mana value is at most the X of the spell.
    'search your library and/or graveyard for a creature card with mana value X or less and put it onto the battlefield',
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
    'search your library for a basic land card and put them onto the battlefield tapped',
    'search your library for up to two basic land cards and put them onto the battlefield tapped',
    'search your library for a creature card, reveal it and put it into your hand',
    'search their library for a basic land card and put it onto the battlefield',
    'search their library for a basic land card, put it onto the battlefield, then shuffle',
    'search your library for a creature card with mana value 3 or less, put it onto the battlefield, then shuffle',
    'search your library for a card, reveal those cards, put it into your hand, then shuffle',
    'search your library for up to X basic land cards, put those cards onto the battlefield tapped, then shuffle',
    'search your library for up to X basic land cards, where X is the number of tapped creatures you control, put it onto the battlefield tapped, then shuffle',
    'search your library for any number of creature cards with total mana value 6 or less, put it onto the battlefield, then shuffle',
    'search your library for any number of creature cards with total mana value 6 or less, put one onto the battlefield and the other into your hand, then shuffle',
    'search your graveyard, hand, and/or library for any number of creature cards with total mana value 6 or less and put them onto the battlefield',
    // Issue 104: with several zones the shuffle is another sentence ("If you search your library this way, shuffle."), and nothing is revealed.
    "search your graveyard, hand, and/or library for a card named God-Pharaoh's Gift, put it onto the battlefield, then shuffle",
    "search your graveyard, hand, and/or library for a card named God-Pharaoh's Gift, reveal it, put it onto the battlefield",
    "search your graveyard, hand, and library for a card named God-Pharaoh's Gift and put it onto the battlefield",
    "search your graveyard and/or hand and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield",
    "search your hand, hand, and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield",
    "search your graveyard, hand, and/or library for up to two cards named God-Pharaoh's Gift and put them onto the battlefield",
    "search their graveyard, hand, and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield",
    'search your library and/or graveyard for creature cards with mana value X or less and put them onto the battlefield',
    'search your library and/or graveyard for a creature card with mana value X or less, reveal it, and put it onto the battlefield',
  ],
  parse: single(
    RULE,
    (ctx, pos) => {
      // Issue 104 (CR 701.23a): "search your graveyard, hand, and/or library for ...": the player searches the zones they choose, and finds one card among them.
      const where = pattern(WHERE)(ctx, pos);
      if (!where.ok) return where;
      const zones = zonesOf(where.value[1] ?? '', { start: pos, end: where.pos });
      if (zones === 'bad') return fail(ctx, pos);
      const noun = choice(
        quiet(family<IrNoun>('noun', { only: [MV_X] })),
        family<IrNoun>('noun', { only: [NOUN, COUNTED] }),
      )(ctx, where.pos);
      if (!noun.ok) return noun;
      const cards = noun.value;
      // Issue 160 (D-626, CR 107.3c): "up to X ... cards, where X is the number of tapped creatures you control": the definition comes right after the noun.
      let after = noun.pos;
      let amount: IrAmount | null = null;
      if (cards.count?.kind === 'x') {
        const defined = sequence(
          literal(', '),
          family<IrAmount>('amount', { only: ['amount.where-x'] }),
        )(ctx, after);
        if (!defined.ok) return defined;
        amount = defined.value[1];
        after = defined.pos;
      }
      const tail = tailFor(cards, true, amount !== null)(ctx, after);
      if (!tail.ok) return tail;
      // Issue 104: with several zones the card is put at once, one card, with nothing revealed and no shuffle in the sentence.
      if (
        zones !== null &&
        (tail.value.reveal.value || tail.value.shuffle.value || cards.plural || amount !== null)
      ) {
        return fail(ctx, pos);
      }
      return { ok: true, value: { cards, amount, zones, ...tail.value }, pos: tail.pos };
    },
    ({ cards, amount, zones, reveal, destinations, shuffle }) => ({
      verb: 'search',
      args: {
        cards,
        destinations,
        reveal,
        shuffle,
        ...(amount === null ? {} : { maxAmount: amount }),
        ...(zones === null ? {} : { zones }),
      },
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

/**
 * `noun.library-card`: what a library search looks for (CR 701.23): "a basic land card", "a Forest
 * card", "a Plains, Island, Swamp, or Mountain card", "an artifact or enchantment card", "a card",
 * "up to two basic land cards". The searcher chooses among the cards that match (CR 701.23a), so
 * the noun is `a`, never a target. Card types, supertypes and colors are lowercase in Oracle text
 * and subtypes are capitalized (CR 205.3, as the cards are printed), so a capitalized word before
 * "card" is a subtype; a choice joins types or subtypes with "or" and is read without modifiers
 * (the same ambiguity as "tapped creature or planeswalker").
 */
import {
  choice,
  fail,
  literal,
  many,
  map,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, node, spanned } from '../registry';
import {
  BOUNDARY,
  CARD_TYPES,
  type FilterParts,
  KEYWORD_SUFFIX,
  type KeywordSuffix,
  MODIFIER,
  NO_PARTS,
  PERMANENT_CARD_TYPES,
  toFilter,
  typeWords,
} from './phrases';

/** A subtype as written on a card: one capitalized word ("Forest", "Aura"), CR 205.3b. */
const SUBTYPE_WORD = '[A-Z][a-z]+(?:-[A-Z][a-z]+)?';
const SUBTYPE = map(pattern(new RegExp(`${SUBTYPE_WORD}${BOUNDARY}`, 'u')), (m) => m[0]);
/** A card type, lowercase as in Oracle text. */
const TYPE_WORD = `(?:${CARD_TYPES})`;

/**
 * "A or B" and "A, B, or C" over single words of one kind (types, or subtypes), at least two:
 * two are joined by " or ", more by commas with ", or " before the last.
 */
function choiceOf(word: string): Parser<string[]> {
  const first = map(pattern(new RegExp(`${word}${BOUNDARY}`, 'u')), (m) => m[0]);
  // One pattern per item: a word that does not fit fails where its separator began.
  const next = pattern(new RegExp(`(, or | or |, )(${word}${BOUNDARY})`, 'u'));
  return (ctx, pos) => {
    const head = first(ctx, pos);
    if (!head.ok) return head;
    const rest = many(map(next, (m) => ({ sep: m[1] ?? '', w: m[2] ?? '' })))(ctx, head.pos);
    if (!rest.ok) return rest;
    const last = rest.value[rest.value.length - 1];
    if (last === undefined) return fail(ctx, pos);
    const words = [head.value, ...rest.value.map((i) => i.w)];
    const shaped =
      rest.value.slice(0, -1).every((i) => i.sep === ', ') &&
      (rest.value.length > 1 ? last.sep === ', or ' : last.sep === ' or ');
    if (!shaped || new Set(words).size !== words.length) return fail(ctx, pos);
    return { ok: true, value: words, pos: rest.pos };
  };
}

/** " card" after a word, or "card" right after a modifier or the article (which end in a space). */
const CARD_WORD = (plural: boolean, spaced = true) =>
  pattern(new RegExp(`${spaced ? ' ' : ''}card${plural ? 's' : ''}${BOUNDARY}`, 'iu'));

/**
 * What may follow "card" of a library phrase (D-261, D-262): " that shares a creature type with it" (one card, the creature of the trigger: CR 205.3m, 603.10a) and
 * " that share a land type" (cards found together: CR 205.3i). Nothing otherwise.
 */
function sharedSuffix(
  plural: boolean,
): Parser<
  Pick<IrFilter, 'sharesCreatureTypeWithIt' | 'sharesCreatureTypeWithSacrificed' | 'sharedLandType'>
> {
  return (ctx, pos) => {
    // Quiet: the words are optional, so their absence is no failure of the line (the diagnostics keep the position they had).
    const r = quiet(
      pattern(
        new RegExp(
          plural
            ? ` that share a land type${BOUNDARY}`
            : // Descendants' Fury (CR 701.21a): "with the sacrificed creature", the permanent an earlier sacrifice of the text sacrificed.
              ` that shares a creature type with (it|the sacrificed creature)${BOUNDARY}`,
          'u',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return { ok: true, value: {}, pos };
    return {
      ok: true,
      value: plural
        ? { sharedLandType: true as const }
        : r.value[1] === 'it'
          ? { sharesCreatureTypeWithIt: true as const }
          : { sharesCreatureTypeWithSacrificed: true as const },
      pos: r.pos,
    };
  };
}

/**
 * " named God-Pharaoh's Gift" after "a card" (issue 104, CR 201.2): the exact name of the card to find, up to the words that go on with the instruction (" and put ...", ", put ...",
 * ", reveal ..."). A name is capitalised words, possibly with a comma, an apostrophe or a hyphen ("Regna, the Redeemer"). Only for one card: a search for a quantity of cards of a
 * name is not built.
 */
const NAMED_SUFFIX =
  / named (\p{Lu}[\p{L}'’-]*(?:,? [\p{L}'’-]+)*?)(?= and put (?:it|that card) |, put |, reveal |$)/u;

/**
 * "<what> cards and/or <what> cards" (Map the Frontier, CR 701.23a): plural cards that are of either kind, or of both at once across the cards found; each kind is a card
 * phrase of its own ("basic land cards and/or Desert cards"). Each card found is any one of the kinds, so the filter is their choice (CR 205.4g, 205.3i).
 */
function libraryAndOr(ctx: Parameters<Parser<IrFilter>>[0], pos: number) {
  const first = libraryPhraseOne(true)(ctx, pos);
  if (!first.ok) return first;
  const joined = literal(' and/or ')(ctx, first.pos);
  if (!joined.ok) return joined;
  const second = libraryPhraseOne(true)(ctx, joined.pos);
  if (!second.ok) return second;
  const base = toFilter('library', NO_PARTS, ctx.text.slice(pos, second.pos));
  return {
    ok: true as const,
    value: { ...base, card: true, anyOf: [first.value, second.value] },
    pos: second.pos,
  };
}

/** The filter of "<what> card(s)", with the library as its zone (CR 401.1) and no owner. */
export function libraryPhrase(plural: boolean): Parser<IrFilter> {
  const one = libraryPhraseOne(plural);
  if (!plural) return one;
  return (ctx, pos) => {
    const both = libraryAndOr(ctx, pos);
    return both.ok ? both : one(ctx, pos);
  };
}

function libraryPhraseOne(plural: boolean): Parser<IrFilter> {
  const cardWord = CARD_WORD(plural);
  return (ctx, pos) => {
    // A choice first: it starts like a single type or subtype.
    const types = sequence(choiceOf(TYPE_WORD), cardWord)(ctx, pos);
    if (types.ok) {
      const base = toFilter('library', NO_PARTS, ctx.text.slice(pos, types.pos));
      const anyOf = types.value[0].map((t): IrFilter => ({ types: [t], raw: t }));
      return { ok: true, value: { ...base, card: true, anyOf }, pos: types.pos };
    }
    // "a basic Mountain, Forest, or Plains card" (D-177): the supertype is said once for the whole list (CR 205.4: basic is a supertype, so every
    // card found is a basic land of one of the types).
    const basic = literal('basic ')(ctx, pos);
    const listAt = basic.ok ? basic.pos : pos;
    const subtypes = sequence(choiceOf(SUBTYPE_WORD), cardWord)(ctx, listAt);
    if (subtypes.ok) {
      const base = toFilter(
        'library',
        basic.ok ? { ...NO_PARTS, supertypes: ['basic'] } : NO_PARTS,
        ctx.text.slice(pos, subtypes.pos),
      );
      const anyOf = subtypes.value[0].map((s): IrFilter => ({ subtypes: [s], raw: s }));
      return { ok: true, value: { ...base, card: true, anyOf }, pos: subtypes.pos };
    }
    // Modifiers, then at most one run of type words or one subtype, then "card(s)".
    const modifiers = many(MODIFIER)(ctx, pos);
    if (!modifiers.ok) return modifiers;
    const parts = modifiers.value.reduce<FilterParts>((acc, m) => m(acc), NO_PARTS);
    // "tapped" and "untapped" mean nothing for a card in a library.
    if (parts.tapped !== undefined) return fail(ctx, pos);
    const kind = choice<{ types: string[] } | { subtype: string } | { permanent: true }>(
      // "a snow permanent card", "a nonland permanent card" (D-260, CR 110.1, 205.4g): a card of any of the permanent types, less those the "non" words leave out.
      map(pattern(new RegExp(`permanent${BOUNDARY}`, 'iu')), () => ({ permanent: true as const })),
      map(typeWords(CARD_TYPES, false), (t) => ({ types: t })),
      map(SUBTYPE, (subtype) => ({ subtype })),
    )(ctx, modifiers.pos);
    const kindEnd = kind.ok ? kind.pos : modifiers.pos;
    const word = (kind.ok ? cardWord : CARD_WORD(plural, false))(ctx, kindEnd);
    if (!word.ok) return word;
    const kinds = kind.ok ? kind.value : { types: [] };
    // D-261, D-262: " that shares a creature type with it" after a creature card, " that share a land type" after land cards; any other kind of card is left as it
    // is, so the words after it are not read.
    const shared = sharedSuffix(plural)(ctx, word.pos);
    if (!shared.ok) return shared;
    const sharing = shared.value;
    const sharesWhat = sharing.sharedLandType === true ? 'land' : 'creature';
    if (
      (sharing.sharesCreatureTypeWithIt === true ||
        sharing.sharesCreatureTypeWithSacrificed === true ||
        sharing.sharedLandType === true) &&
      (!('types' in kinds) || !kinds.types.includes(sharesWhat))
    ) {
      return fail(ctx, pos);
    }
    if ('permanent' in kinds) {
      const left = PERMANENT_CARD_TYPES.filter((t) => !parts.notTypes.includes(t));
      if (left.length === 0) return fail(ctx, pos);
      const filter = toFilter(
        'library',
        { ...parts, notTypes: [], types: [] },
        ctx.text.slice(pos, shared.pos),
      );
      const anyOf = left.map((t): IrFilter => ({ types: [t], raw: t }));
      return { ok: true, value: { ...filter, card: true, anyOf }, pos: shared.pos };
    }
    // Issue 104 (CR 201.2): "a card named God-Pharaoh's Gift": one card, with no kind of card before "card" and nothing after the name but the rest of the instruction.
    const named =
      plural || kind.ok || modifiers.value.length > 0
        ? null
        : quiet(pattern(NAMED_SUFFIX))(ctx, shared.pos);
    // Mystical Teachings (CR 702.8a, 701.23): "a card with flash": the keyword the card has, one only, had and never "without" (the rest of a list is left unread).
    const withKeyword =
      named?.ok === true || shared.pos !== word.pos
        ? null
        : quiet(
            choice(
              satisfy(KEYWORD_SUFFIX, (k) => k.has),
              map(
                pattern(new RegExp(` with flash${BOUNDARY}`, 'u')),
                (): KeywordSuffix => ({ has: true, keyword: 'flash' }),
              ),
            ),
          )(ctx, word.pos);
    const end =
      named?.ok === true ? named.pos : withKeyword?.ok === true ? withKeyword.pos : shared.pos;
    const filter = toFilter(
      'library',
      {
        ...parts,
        types: 'types' in kinds ? kinds.types : [],
        keywords: withKeyword?.ok === true ? [withKeyword.value.keyword] : [],
      },
      ctx.text.slice(pos, end),
    );
    return {
      ok: true,
      value: {
        ...filter,
        card: true,
        ...('subtype' in kinds ? { subtypes: [kinds.subtype] } : {}),
        ...sharing,
        ...(named?.ok === true ? { named: named.value[1] ?? '' } : {}),
      },
      pos: end,
    };
  };
}

/**
 * "a snow permanent card, a legendary card, or a Saga card" (D-260, CR 701.23a): one card that is any of the kinds, each said as a card of its own ("a creature
 * card or a land card"). Two or more; "A or B" has one " or a", "A, B, or C" commas with ", or " before the last (anything else is not English). The filter is
 * the choice of the kinds, each a filter with its own words; the library is where to look (CR 401.1).
 */
function libraryUnion(ctx: Parameters<Parser<IrFilter>>[0], pos: number) {
  const item = map(sequence(pattern(/an? /i), libraryPhrase(false)), ([, filter]) => filter);
  const first = item(ctx, pos);
  if (!first.ok) return first;
  const more = many(
    map(sequence(pattern(/(, or | or |, )an? /i), libraryPhrase(false)), ([sep, filter]) => ({
      sep: sep[1] ?? '',
      filter,
    })),
  )(ctx, first.pos);
  if (!more.ok) return more;
  const items = more.value;
  const last = items[items.length - 1];
  if (last === undefined) return fail(ctx, pos);
  const shaped =
    items.slice(0, -1).every((i) => i.sep === ', ') &&
    (items.length > 1 ? last.sep === ', or ' : last.sep === ' or ');
  if (!shaped) return fail(ctx, pos);
  const base = toFilter('library', NO_PARTS, ctx.text.slice(pos, more.pos));
  const anyOf = [first.value, ...items.map((i) => i.filter)];
  return { ok: true as const, value: { ...base, card: true, anyOf }, pos: more.pos };
}

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/** CR 701.23b: whether the cards are looked for by a stated quality (a card type, a subtype or a supertype), so the player is not required to find them. A bare "cards" or a named card has none. */
function hasStatedQuality(filter: IrFilter): boolean {
  return (
    filter.named === undefined &&
    ((filter.types?.length ?? 0) > 0 ||
      (filter.subtypes?.length ?? 0) > 0 ||
      (filter.supertypes?.length ?? 0) > 0 ||
      (filter.anyOf?.length ?? 0) > 0)
  );
}

/**
 * `noun.library-card`: "a" or "an" and one card, or "up to N" (two or more) and cards. A count
 * without "up to" ("two basic land cards") is not read: a search for a quality may find fewer
 * (CR 701.23b) and the Oracle text says so with "up to".
 */
export const NOUN_LIBRARY_CARD = defineRule<IrNoun>({
  id: 'noun.library-card',
  family: 'noun',
  leading: ['a', 'an', 'up', 'any'],
  cites: [
    'CR 701.23a (Search)',
    'CR 701.23b (Search)',
    'CR 205.3 (Subtypes)',
    'CR 401.1 (Library)',
    'CR 205.4g (Supertypes)',
    'CR 110.1 (Permanents)',
    'CR 205.3m (Subtypes)',
    'CR 205.3i (Subtypes)',
    'CR 603.10a (Triggered Abilities)',
  ],
  examples: [
    'a basic land card',
    'a card',
    'a creature card',
    'an artifact card',
    'a Forest card',
    'a Plains, Island, Swamp, or Mountain card',
    'a basic Mountain, Forest, or Plains card',
    'a basic Swamp or Forest card',
    'an Island or Swamp card',
    'an artifact or enchantment card',
    'an Aura or Equipment card',
    'up to two basic land cards',
    'up to three Forest cards',
    'up to two basic land cards and/or Desert cards',
    'up to X basic land cards',
    'a snow permanent card',
    'a nonland permanent card',
    'up to two permanent cards',
    'a snow permanent card, a legendary card, or a Saga card',
    'a creature card or a land card',
    'an artifact card or a Saga card',
    'a legendary card, an Aura card, or an instant card',
    'a creature card that shares a creature type with it',
    'an artifact creature card that shares a creature type with it',
    'up to two basic land cards that share a land type',
    'up to three basic land cards that share a land type',
    // CR 701.23, 202.3: any number of cards with a total mana value.
    'any number of creature cards with total mana value 6 or less',
    'any number of nonland permanent cards with total mana value 4 or less',
    // CR 701.23, 701.23b (Bilbo, Birthday Celebrant): any number of cards, with no limit.
    'any number of creature cards',
    'any number of nonland permanent cards',
    // Issue 104 (CR 201.2): a card of a given name.
    "a card named God-Pharaoh's Gift",
    'a card named Regna, the Redeemer',
    // Mystical Teachings (CR 702.8a): a card that has a keyword, alone or as one of the kinds of a choice.
    'a card with flash',
    'a creature card with flying',
    'an instant card or a card with flash',
  ],
  rejects: [
    'a basic land',
    'basic land card',
    'two cards',
    'up to one basic land card',
    'a Plains or island card',
    'a basic Plains or island card',
    'a basic Forest, or Island card',
    'a basic Forest or creature card',
    'a basic Forest, Forest, or Island card',
    'a Forest or creature card',
    'a tapped land card',
    'a card from your hand',
    'a creature card with mana value 3 or less',
    'a basic land cards',
    'up to two basic land cards and/or',
    'up to two basic land cards and/or Desert card',
    'a basic land card and/or a Desert card',
    'a nonpermanent card',
    'a snow permanent card, a legendary card, a Saga card',
    'a snow permanent card, or a Saga card, or a legendary card',
    'a snow permanent card or a legendary card, or a Saga card',
    'a snow permanent card, legendary card, or a Saga card',
    'a snow permanent card, a legendary card or a Saga card',
    'a snow permanent card and a Saga card',
    'a snow permanent card, or a legendary card',
    'a snow permanent card or legendary card',
    'a snow permanent card or a legendary card from your graveyard',
    'a land card that shares a creature type with it',
    'a card that shares a creature type with it',
    'a creature card that shares a land type with it',
    'a creature card that shares a creature type',
    'a creature card that share a creature type with it',
    'a snow permanent card that shares a creature type with it',
    'a Goblin card that shares a creature type with it',
    'a creature card that shares a creature type with them',
    'a basic land card that share a land type',
    'up to two basic land cards that shares a land type',
    'up to two creature cards that share a land type',
    'up to two basic land cards that share a creature type',
    'up to two basic land cards that share a land type with it',
    'up to two basic land cards that share a type',
    'up to two basic land cards that share a land type, put them onto the battlefield',
    'up to two basic land cards that share a creature type with it',
    'up to two permanent cards that share a land type',
    'up to two Forest cards that share a land type',
    'any number of creature card',
    'any number of cards that share a land type',
    'any number of creature cards with total mana value 0 or less',
    'any number of creature cards with mana value 6 or less',
    'any number of creature cards with total mana value 6',
    'any number of creature cards with total mana value 6 or more',
    'any number of creature card with total mana value 6 or less',
    'any number of creature cards that share a land type with total mana value 6 or less',
    'a creature card with total mana value 6 or less',
    'up to two creature cards with total mana value 6 or less',
    'a card without flash',
    'a card with flash and haste',
    'a card named',
    'a card named gift',
    'a creature card named Regna',
    'a basic card named Regna',
    'two cards named Regna',
    'up to two cards named Regna',
  ],
  parse: node<Bare, IrNoun>(
    'noun.library-card',
    choice<Bare>(
      map(
        sequence(
          literal('up to '),
          spanned(satisfy(quantity, (n) => n >= 2)),
          literal(' '),
          libraryPhrase(true),
        ),
        ([, count, , filter]): Bare => ({
          kind: 'noun',
          det: 'a',
          filter,
          upTo: true,
          plural: true,
          other: false,
          count: { kind: 'number', value: count.value, span: count.span },
        }),
      ),
      // CR 701.23, 202.3: "any number of creature cards with total mana value 6 or less": any number (none included) whose mana values add up to at most the limit.
      map(
        sequence(
          literal('any number of '),
          libraryPhrase(true),
          literal(' with total mana value '),
          spanned(satisfy(quantity, (n) => n >= 1)),
          literal(' or less'),
        ),
        ([, filter, , limit]): Bare => ({
          kind: 'noun',
          det: 'a',
          filter: { ...filter, anyNumberTotalManaValue: limit.value },
          upTo: true,
          plural: true,
          other: false,
        }),
      ),
      // CR 701.23, 701.23b: "any number of creature cards": any number (none included) with no limit but the library.
      map(
        sequence(literal('any number of '), libraryPhrase(true)),
        ([, filter]): Bare => ({
          kind: 'noun',
          det: 'a',
          filter: { ...filter, anyNumber: true as const },
          upTo: true,
          plural: true,
          other: false,
        }),
      ),
      // Issue 160 (D-626): "up to X basic land cards, where X is ...": the count is the X the search rule reads the definition of.
      map(
        sequence(literal('up to X '), libraryPhrase(true)),
        ([, filter]): Bare => ({
          kind: 'noun',
          det: 'a',
          filter,
          upTo: true,
          plural: true,
          other: false,
          count: { kind: 'x', span: { start: 0, end: 0 } },
        }),
      ),
      // D-260: "a snow permanent card, a legendary card, or a Saga card": one card of any of several kinds, before the single kind it starts like.
      map(
        libraryUnion,
        (filter): Bare => ({
          kind: 'noun',
          det: 'a',
          filter,
          upTo: false,
          plural: false,
          other: false,
        }),
      ),
      map(sequence(pattern(/an? /i), libraryPhrase(false)), ([, filter]) => ({
        kind: 'noun',
        det: 'a',
        filter,
        upTo: false,
        plural: false,
        other: false,
      })),
    ),
    (b) => b,
  ),
});

/**
 * `noun.library-cards-counted`: "four basic land cards" (Planar Engineering; CR 701.23b): a count of two or more cards looked for by a stated quality (a card type, a subtype or a
 * supertype), so the player is not required to find them all, as for "up to four". Only a search reads it (`effect.search`): "reveal cards until you reveal two land cards" says
 * another thing (the player must reveal them), so the other rules that read `noun.library-card` do not see this one. Not read: a bare "cards", a named card, one card, "up to".
 */
export const NOUN_LIBRARY_CARDS_COUNTED = defineRule<IrNoun>({
  id: 'noun.library-cards-counted',
  family: 'noun',
  // A count can be any number word or digit, so every position is tried.
  leading: [],
  cites: ['CR 701.23b (Search)', 'CR 701.23a (Search)', 'CR 205.4g (Supertypes)'],
  examples: [
    'four basic land cards',
    'two basic land cards',
    'three Forest cards',
    '2 creature cards',
  ],
  rejects: [
    'two cards',
    'four basic land card',
    'one basic land card',
    'two cards named Regna',
    'up to four basic land cards',
    'a basic land card',
    'four tapped land cards',
  ],
  parse: node<Bare, IrNoun>(
    'noun.library-cards-counted',
    map(
      sequence(
        spanned(satisfy(quantity, (n) => n >= 2)),
        literal(' '),
        satisfy(libraryPhrase(true), hasStatedQuality),
      ),
      ([count, , filter]): Bare => ({
        kind: 'noun',
        det: 'a',
        filter,
        upTo: true,
        plural: true,
        other: false,
        count: { kind: 'number', value: count.value, span: count.span },
      }),
    ),
    (b) => b,
  ),
});

export const LIBRARY_NOUN_RULES = [NOUN_LIBRARY_CARD, NOUN_LIBRARY_CARDS_COUNTED];

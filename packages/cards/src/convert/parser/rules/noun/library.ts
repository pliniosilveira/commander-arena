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
): Parser<Pick<IrFilter, 'sharesCreatureTypeWithIt' | 'sharedLandType'>> {
  return (ctx, pos) => {
    // Quiet: the words are optional, so their absence is no failure of the line (the diagnostics keep the position they had).
    const r = quiet(
      pattern(
        new RegExp(
          plural
            ? ` that share a land type${BOUNDARY}`
            : ` that shares a creature type with it${BOUNDARY}`,
          'u',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return { ok: true, value: {}, pos };
    return {
      ok: true,
      value: plural
        ? { sharedLandType: true as const }
        : { sharesCreatureTypeWithIt: true as const },
      pos: r.pos,
    };
  };
}

/** The filter of "<what> card(s)", with the library as its zone (CR 401.1) and no owner. */
function libraryPhrase(plural: boolean): Parser<IrFilter> {
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
    const sharesWhat = sharing.sharesCreatureTypeWithIt === true ? 'creature' : 'land';
    if (
      (sharing.sharesCreatureTypeWithIt === true || sharing.sharedLandType === true) &&
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
    const filter = toFilter(
      'library',
      { ...parts, types: 'types' in kinds ? kinds.types : [] },
      ctx.text.slice(pos, shared.pos),
    );
    return {
      ok: true,
      value: {
        ...filter,
        card: true,
        ...('subtype' in kinds ? { subtypes: [kinds.subtype] } : {}),
        ...sharing,
      },
      pos: shared.pos,
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

/**
 * `noun.library-card`: "a" or "an" and one card, or "up to N" (two or more) and cards. A count
 * without "up to" ("two basic land cards") is not read: a search for a quality may find fewer
 * (CR 701.23b) and the Oracle text says so with "up to".
 */
export const NOUN_LIBRARY_CARD = defineRule<IrNoun>({
  id: 'noun.library-card',
  family: 'noun',
  leading: ['a', 'an', 'up'],
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
  ],
  rejects: [
    'a basic land',
    'basic land card',
    'two basic land cards',
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

export const LIBRARY_NOUN_RULES = [NOUN_LIBRARY_CARD];

/**
 * The words inside a noun phrase: type words, modifiers ("nonland", "tapped", "red"), the control
 * suffix and the graveyard owner. These are leaf vocabulary (tables, proposal section 2 (d)), not
 * rules of their own: the noun rules in index.ts compose them. All read into an `IrFilter`.
 */

import { BASIC_LAND_TYPES } from '@commander-arena/engine';
import {
  choice,
  fail,
  literal,
  many,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrComparison, IrFilter } from '../../ir/types';
import { GRANTABLE_KEYWORDS } from '../keyword/vocabulary';
import { readCreatureType } from './creature-types';
import { PLANESWALKER_TYPES, SUBTYPE_WORD_NUMBERED, type SubtypeWord, subtypeOf } from './subtypes';

export interface FilterParts {
  readonly types: readonly string[];
  readonly notTypes: readonly string[];
  readonly supertypes: readonly string[];
  readonly colors: readonly string[];
  readonly tapped: boolean | undefined;
  readonly controller: 'you' | 'opponent' | 'triggerPlayer' | 'defendingPlayer' | undefined;
  /** "nontoken" (false), CR 111.1; stage P29. */
  readonly token: boolean | undefined;
  /** "non-Zombie": none of these subtypes (CR 205.3d); stage P29. */
  readonly notSubtypes: readonly string[];
  /** "colorless" (CR 105.2c); stage P29. */
  readonly colorless: boolean;
  /** "with flying" and "without flying": the keyword words, lowercase (CR 702); stage P29. */
  readonly keywords: readonly string[];
  readonly notKeywords: readonly string[];
  /** "nonbasic": none of these supertypes (CR 205.4); stage P30. */
  readonly notSupertypes: readonly string[];
  /** "attacking" (CR 508.1k: an attacking creature); stage P31. */
  readonly attacking: boolean;
  /** "attacking or blocking" (stage P68, D-229, CR 506.4, 509.1g). */
  readonly attackingOrBlocking: boolean;
  /** "historic" (stage P68, D-230, CR 700.6): an artifact, a legendary permanent or a Saga. */
  readonly historic: boolean;
  /** "monocolored", "multicolored" (CR 105.2a, 105.2b): the number of colors; stage P31. */
  readonly colorCount: IrComparison | undefined;
}

export const NO_PARTS: FilterParts = {
  types: [],
  notTypes: [],
  supertypes: [],
  colors: [],
  tapped: undefined,
  controller: undefined,
  token: undefined,
  notSubtypes: [],
  colorless: false,
  keywords: [],
  notKeywords: [],
  notSupertypes: [],
  attacking: false,
  attackingOrBlocking: false,
  historic: false,
  colorCount: undefined,
};

export type Modifier = (parts: FilterParts) => FilterParts;

function word(text: string, modifier: Modifier): Parser<Modifier> {
  // Modifiers are followed by a space; the word boundary keeps "tapped" out of "untapped".
  return map(pattern(new RegExp(`${text} `, 'i')), () => modifier);
}

const NON_TYPES = ['land', 'creature', 'artifact', 'enchantment', 'planeswalker'] as const;
const COLOR_WORDS = ['white', 'blue', 'black', 'red', 'green'] as const;
const SUPERTYPE_WORDS = ['legendary', 'basic', 'snow'] as const;

/**
 * "non-Zombie " (stage P29, CR 205.3d): a creature type or another subtype of the table after "non-", in the singular,
 * with the space that ends every modifier. Whatever type follows, none of the creature types is named here.
 */
const NON_SUBTYPE: Parser<Modifier> = (ctx, pos) => {
  const r = sequence(
    literal('non-'),
    satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
    literal(' '),
  )(ctx, pos);
  if (!r.ok) return r;
  const { subtype } = r.value[1];
  return {
    ok: true,
    value: (p) => ({ ...p, notSubtypes: [...p.notSubtypes, subtype] }),
    pos: r.pos,
  };
};

export const MODIFIER: Parser<Modifier> = choice(
  ...NON_TYPES.map((t) => word(`non${t}`, (p) => ({ ...p, notTypes: [...p.notTypes, t] }))),
  // Stage P70 (D-231): "nonland, nontoken permanent": the comma between two modifiers.
  ...NON_TYPES.map((t) => word(`non${t},`, (p) => ({ ...p, notTypes: [...p.notTypes, t] }))),
  // Stage P29 (D-133): a nontoken permanent, a colorless one, one that is not of a creature type.
  word('nontoken', (p) => ({ ...p, token: false })),
  // Stage P68 (D-230): "a nontoken, non-Angel creature": the comma between two modifiers.
  word('nontoken,', (p) => ({ ...p, token: false })),
  word('colorless', (p) => ({ ...p, colorless: true })),
  // Stage P30 (D-135): "nonbasic land" (CR 205.4: basic is a supertype), the engine's `notSupertypes`.
  word('nonbasic', (p) => ({ ...p, notSupertypes: [...p.notSupertypes, 'basic'] })),
  // Stage P31 (D-140): "attacking creature" (CR 508.1k), "monocolored" and "multicolored" (CR 105.2a, 105.2b: one color, two or more).
  // Stage P68 (D-229): "attacking or blocking creature" (CR 506.4, 509.1g), before "attacking", of which it is the start.
  word('historic', (p) => ({ ...p, historic: true })),
  word('attacking or blocking', (p) => ({ ...p, attackingOrBlocking: true })),
  word('attacking', (p) => ({ ...p, attacking: true })),
  word('monocolored', (p) => ({ ...p, colorCount: { cmp: 'equal', value: 1 } })),
  word('multicolored', (p) => ({ ...p, colorCount: { cmp: 'atLeast', value: 2 } })),
  NON_SUBTYPE,
  word('untapped', (p) => ({ ...p, tapped: false })),
  word('tapped', (p) => ({ ...p, tapped: true })),
  ...COLOR_WORDS.map((c) => word(c, (p) => ({ ...p, colors: [...p.colors, c] }))),
  ...SUPERTYPE_WORDS.map((s) => word(s, (p) => ({ ...p, supertypes: [...p.supertypes, s] }))),
);

export const PERMANENT_TYPES = 'artifact|battle|creature|enchantment|land|planeswalker';
/** The permanent types in the order of "permanent card" (stage P33): a card of any of them is a permanent card (CR 110.1). */
export const PERMANENT_CARD_TYPES: readonly string[] = [
  'artifact',
  'creature',
  'enchantment',
  'land',
  'planeswalker',
  'battle',
];
export const CARD_TYPES = `${PERMANENT_TYPES}|instant|sorcery`;
export const BOUNDARY = '(?![\\p{L}\\p{N}])';

/** One or more type words ("artifact creature"); with `plural` the last one ends in s. */
export function typeWords(alternatives: string, plural: boolean): Parser<string[]> {
  const re = new RegExp(
    `((?:(?:${alternatives}) )*(?:${alternatives}))${plural ? 's' : ''}${BOUNDARY}`,
    'iu',
  );
  return map(pattern(re), (m) => (m[1] ?? '').toLowerCase().split(' '));
}

function permanentNoun(plural: boolean): Parser<string[]> {
  return choice(
    map(pattern(new RegExp(`permanent${plural ? 's' : ''}${BOUNDARY}`, 'iu')), (): string[] => []),
    typeWords(PERMANENT_TYPES, plural),
  );
}

export const CONTROL_SUFFIX: Parser<'you' | 'opponent'> = choice(
  // "for each Angel you already control" (stage P33, D-150): said of the permanents there are before the one that enters, which is all
  // a count of permanents ever reads.
  map(pattern(new RegExp(` you (?:already )?control${BOUNDARY}`, 'iu')), () => 'you' as const),
  map(
    pattern(
      new RegExp(
        ` (?:you don['’]t control|an opponent controls|your opponents control)${BOUNDARY}`,
        'iu',
      ),
    ),
    () => 'opponent' as const,
  ),
);

/**
 * " that opponent controls" and " defending player controls" (stage P34, D-152, CR 603.2, 508.5): the player the event of the trigger is about
 * ("Whenever one or more Dragons you control deal combat damage to an opponent, destroy target artifact that opponent controls") and the player a
 * creature attacks ("target creature defending player controls"). Read in the permanent phrase only; the engine allows them in the abilities
 * that have such a player (`validateCard`).
 */
export const EVENT_CONTROL_SUFFIX: Parser<
  'you' | 'opponent' | 'triggerPlayer' | 'defendingPlayer'
> = choice(
  CONTROL_SUFFIX,
  map(
    pattern(new RegExp(` that opponent controls${BOUNDARY}`, 'iu')),
    () => 'triggerPlayer' as const,
  ),
  map(
    pattern(new RegExp(` defending player controls${BOUNDARY}`, 'iu')),
    () => 'defendingPlayer' as const,
  ),
);

export function toFilter(
  zone: NonNullable<IrFilter['zone']>,
  p: FilterParts,
  raw: string,
): IrFilter {
  return {
    zone,
    ...(p.types.length > 0 ? { types: p.types } : {}),
    ...(p.notTypes.length > 0 ? { notTypes: p.notTypes } : {}),
    ...(p.supertypes.length > 0 ? { supertypes: p.supertypes } : {}),
    ...(p.colors.length > 0 ? { colors: p.colors } : {}),
    ...(p.tapped !== undefined ? { tapped: p.tapped } : {}),
    ...(p.controller !== undefined ? { controller: p.controller } : {}),
    ...(p.token !== undefined ? { token: p.token } : {}),
    ...(p.notSubtypes.length > 0 ? { notSubtypes: p.notSubtypes } : {}),
    ...(p.colorless ? { colorless: true as const } : {}),
    ...(p.keywords.length > 0 ? { keywords: p.keywords } : {}),
    ...(p.notKeywords.length > 0 ? { notKeywords: p.notKeywords } : {}),
    ...(p.notSupertypes.length > 0 ? { notSupertypes: p.notSupertypes } : {}),
    ...(p.attacking ? { attacking: true as const } : {}),
    ...(p.attackingOrBlocking ? { attackingOrBlocking: true as const } : {}),
    ...(p.historic ? { historic: true as const } : {}),
    ...(p.colorCount !== undefined ? { colorCount: p.colorCount } : {}),
    raw,
  };
}

/**
 * "artifact or enchantment", "creature or planeswalker", "artifact, creature, enchantment, or
 * land": a choice of permanent types, one type word each (CR 205.2a: the card types; a permanent
 * with either type matches). Two items are joined by " or ", more by commas with "or" before the
 * last (anything else is not English and is not read). Modifiers are not allowed in front: "tapped
 * creature or planeswalker" is ambiguous about what "tapped" modifies, so it stays unread.
 */
export function typeChoice(
  alternatives: string,
  subtypes = false,
  join: 'or' | 'and' | 'and/or' = 'or',
): Parser<string[]> {
  // Card types are lowercase in Oracle text and subtypes are capitalized (CR 205.3), so a list of
  // subtypes is matched with case and kept as written.
  const flags = subtypes ? 'u' : 'iu';
  const written = (word: string | undefined) =>
    subtypes ? (word ?? '') : (word ?? '').toLowerCase();
  return (ctx, pos) => {
    const first = map(pattern(new RegExp(`(?:${alternatives})${BOUNDARY}`, flags)), (m) =>
      written(m[0]),
    )(ctx, pos);
    if (!first.ok) return first;
    // One pattern per item, so a word that is not a type fails where the separator began and the
    // diagnostic points at "or Dragon", not past it.
    const more = many(
      map(
        pattern(new RegExp(`(, ${join} | ${join} |, )((?:${alternatives})${BOUNDARY})`, flags)),
        (m) => ({
          separator: (m[1] ?? '').toLowerCase(),
          type: written(m[2]),
        }),
      ),
    )(ctx, first.pos);
    if (!more.ok) return more;
    const items = more.value;
    const types = [first.value, ...items.map((i) => i.type)];
    const last = items[items.length - 1];
    if (last === undefined) return fail(ctx, pos);
    // "A or B": one " or ". "A, B, or C": commas, then ", or " before the last (the same with
    // "and", for the subjects of a statement: "Instant and sorcery spells").
    const shaped =
      items.slice(0, -1).every((i) => i.separator === ', ') &&
      (items.length > 1 ? last.separator === `, ${join} ` : last.separator === ` ${join} `);
    if (!shaped || new Set(types).size !== types.length) return fail(ctx, pos);
    return { ok: true, value: types, pos: more.pos };
  };
}

const TYPE_CHOICE: Parser<string[]> = typeChoice(PERMANENT_TYPES);

/**
 * " of the chosen type" and " of the chosen color" (stage P15, D-100, CR 607.2d): what the source of
 * the ability chose as it entered. The engine reads the creature type or the color from the source
 * and refuses the card unless it asks the question itself (`asEntersChoose`).
 */
export const CHOSEN_SUFFIX: Parser<'type' | 'color'> = map(
  pattern(new RegExp(` of the chosen (type|color)${BOUNDARY}`, 'iu')),
  (m) => (m[1] ?? '').toLowerCase() as 'type' | 'color',
);

/**
 * Which subtype words a permanent phrase reads (stage P15, CR 205.3): none (the phrase is types and
 * modifiers only), every listed subtype, or every one but the five basic land types (a phrase whose
 * neighbour rule owns "a Forest": `condition.control-land-type`).
 */
export type SubtypeMode = false | 'all' | 'notBasicLand';

const isBasicLandType = (word: string): boolean => word in BASIC_LAND_TYPES;

/**
 * The subtype words of a phrase and the type words after them: "Plant creature" (subtypes, then
 * the type), "Elves" and "Forest" (subtypes alone, the last in the number the phrase asks for).
 * The words before a type are singular ("Elf creatures"); a bare subtype is the noun itself, so its
 * number must agree with the phrase (CR 205.3: a subtype is a word of the type line).
 */
function subtyped(
  plural: boolean,
  mode: Exclude<SubtypeMode, false>,
): Parser<{ subtypes: string[]; types: string[] }> {
  const allowed = (word: SubtypeWord) => mode === 'all' || !isBasicLandType(word.subtype);
  // One or more subtype words in a row ("Elf Warrior"), none of them a basic land type in the mode
  // that leaves those to another rule; the separator after the last is left unread.
  const run = separatedBy1(satisfy(SUBTYPE_WORD_NUMBERED, allowed), literal(' '));
  const prefixed: Parser<{ subtypes: string[]; types: string[] }> = map(
    sequence(
      satisfy(run, (words) => words.every((w) => w.plural !== true)),
      literal(' '),
      permanentNoun(plural),
    ),
    ([words, , types]) => ({ subtypes: words.map((w) => w.subtype), types }),
  );
  const bare: Parser<{ subtypes: string[]; types: string[] }> = map(
    satisfy(run, (words) => {
      const last = words[words.length - 1];
      if (last === undefined || words.slice(0, -1).some((w) => w.plural === true)) return false;
      // A planeswalker type names no group of permanents by itself ("Ugin planeswalker"), stage P34 (D-152).
      if (words.some((w) => PLANESWALKER_TYPES.has(w.subtype))) return false;
      // "Plains" is its own plural, but a bare "Plains" is what "Enchant Plains" names
      // (`noun.bare-land-type`), not a group of permanents.
      return (
        last.plural === plural ||
        (last.plural === null && !(plural && isBasicLandType(last.subtype)))
      );
    }),
    (words) => ({ subtypes: words.map((w) => w.subtype), types: [] as string[] }),
  );
  return choice(prefixed, bare);
}

/** The values of an object a comparison can read (stage P18, D-111). */
export type Comparable = 'power' | 'toughness' | 'manaValue';

/** One comparison of a filter: which value, and how it is compared with the number. */
export interface Comparison extends IrComparison {
  readonly of: Comparable;
}

const COMPARED_WORDS: Readonly<Record<string, Comparable>> = {
  power: 'power',
  toughness: 'toughness',
  'mana value': 'manaValue',
};

/**
 * " with power 4 or greater", " with toughness 2 or less", " with mana value 3" (stage P18, D-111,
 * CR 202.3 mana value, CR 208.1 power and toughness): a number and, after "or", the direction. "Greater
 * than" and "less than" (strict) and another object's value are other wordings and are not read.
 * `only` narrows the values a phrase reads: a spell has no power or toughness on the stack.
 */
export function comparisonSuffix(only: readonly Comparable[]): Parser<Comparison> {
  return (ctx, pos) => {
    const r = pattern(
      new RegExp(
        ` with (power|toughness|mana value) (\\d+)(?: or (greater|less))?${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const of = COMPARED_WORDS[(r.value[1] ?? '').toLowerCase()];
    const direction = (r.value[3] ?? '').toLowerCase();
    if (of === undefined || !only.includes(of)) return fail(ctx, pos);
    const cmp = direction === 'greater' ? 'atLeast' : direction === 'less' ? 'atMost' : 'equal';
    return { ok: true, value: { of, cmp, value: Number(r.value[2]) }, pos: r.pos };
  };
}

/** The filter with the comparison added, as the field the comparison names. */
export function withComparison(filter: IrFilter, comparison: Comparison | undefined): IrFilter {
  if (comparison === undefined) return filter;
  const { of, ...compared } = comparison;
  return { ...filter, [of]: compared };
}

const ALL_COMPARABLE: readonly Comparable[] = ['power', 'toughness', 'manaValue'];

/** " with mana value X" (stage P31, CR 107.3a, 202.3): the mana value equal to the X announced for the ability. */
const MANA_VALUE_X: Parser<boolean> = map(
  pattern(new RegExp(` with mana value X${BOUNDARY}(?! or )`, 'u')),
  () => true,
);

/** " with mana value X or less" (stage P68, D-230, CR 202.3): the mana value is at most the X a "where X is ..." defines. */
const MANA_VALUE_X_OR_LESS: Parser<boolean> = map(
  pattern(new RegExp(` with mana value X or less${BOUNDARY}`, 'u')),
  () => true,
);

/**
 * " whose controller was dealt combat damage by ~ this turn" (stage P31, CR 510.2, 120.2): the object's controller is a player the
 * source of the ability dealt combat damage to this turn.
 */
const DAMAGED_BY_SOURCE: Parser<boolean> = map(
  pattern(new RegExp(` whose controller was dealt combat damage by ~ this turn${BOUNDARY}`, 'iu')),
  () => true,
);

/**
 * " with a counter on it", " with a +1/+1 counter on it", " with a stun counter on it" and, in the plural, " with counters on them",
 * " with +1/+1 counters on them" (stage P32, D-147, CR 122.1): the object has a counter, of any kind (`true`) or of the kind named.
 */
export function counterSuffix(plural: boolean): Parser<true | string> {
  const kind = '([+-]\\d+\\/[+-]\\d+|[a-z]+)';
  const re = plural
    ? new RegExp(` with (?:${kind} )?counters on them${BOUNDARY}`, 'iu')
    : new RegExp(` with an? (?:${kind} )?counter on it${BOUNDARY}`, 'iu');
  return map(pattern(re), (m): true | string => (m[1] === undefined ? true : m[1].toLowerCase()));
}

/** What " with flying" and " without flying" say (stage P29, D-133): the keyword, and whether it is had or not. */
export interface KeywordSuffix {
  readonly has: boolean;
  /** The keyword as `SIMPLE_KEYWORDS` spells it ("first strike"). */
  readonly keyword: string;
}

/**
 * " with flying", " without flying" (stage P29, CR 702): one keyword the engine can grant (the keywords without
 * parameters, `GRANTABLE_KEYWORDS`), had or not had. A list ("with flying or reach", "with flying and trample") says
 * more than one thing: what follows the first keyword is left unread, so the phrase around it does not read.
 */
export const KEYWORD_SUFFIX: Parser<KeywordSuffix> = (ctx, pos) => {
  for (const [word] of GRANTABLE_KEYWORDS) {
    const r = pattern(new RegExp(` (with|without) ${word.replace(' ', '\\s+')}${BOUNDARY}`, 'iu'))(
      ctx,
      pos,
    );
    if (r.ok) {
      const has = (r.value[1] ?? '').toLowerCase() === 'with';
      return { ok: true, value: { has, keyword: word }, pos: r.pos };
    }
  }
  return fail(ctx, pos);
};

/** "nonland permanent you control": the filter of a phrase about permanents (CR 110.1). */
export function permanentPhrase(plural: boolean, subtypes: SubtypeMode = false): Parser<IrFilter> {
  const choose: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      TYPE_CHOICE,
      // "artifact, enchantment, or creature with power 4 or greater" (stage P33, D-150): a power or a toughness belongs to the creature
      // among the types, the only one that has either; it is said of the last one only.
      optional(quiet(comparisonSuffix(['power', 'toughness'])), undefined),
      optional(CONTROL_SUFFIX, undefined),
    )(ctx, pos);
    if (!r.ok) return r;
    const [types, compared, controller] = r.value;
    const last = types[types.length - 1];
    if (compared !== undefined && (types.length < 2 || last !== 'creature')) return fail(ctx, pos);
    const base = toFilter('battlefield', { ...NO_PARTS, controller }, ctx.text.slice(pos, r.pos));
    const anyOf = types.map((t): IrFilter => {
      const member: IrFilter = { types: [t], raw: t };
      return t === last ? withComparison(member, compared) : member;
    });
    return { ok: true, value: { ...base, anyOf }, pos: r.pos };
  };
  const nouns: Parser<{ subtypes: string[]; types: string[] }> =
    subtypes === false
      ? map(permanentNoun(plural), (types) => ({ subtypes: [] as string[], types }))
      : choice(
          subtyped(plural, subtypes),
          map(permanentNoun(plural), (types) => ({ subtypes: [] as string[], types })),
        );
  // The words after the noun: who controls it, "of the chosen type" and a comparison ("with power 4 or
  // greater"), in the orders cards use ("creatures you control of the chosen type", "creatures of the
  // chosen type you control", "creature you control with power 4 or greater", "creature with power 4
  // or greater you control").
  const tail: Parser<{
    controller: 'you' | 'opponent' | 'triggerPlayer' | 'defendingPlayer' | undefined;
    chosen: 'type' | 'color' | undefined;
    compared: Comparison | undefined;
    keyword: KeywordSuffix | undefined;
    manaValueX: boolean;
    damaged: boolean;
    counter: true | string | undefined;
  }> = (ctx, pos) => {
    const control = optional(EVENT_CONTROL_SUFFIX, undefined)(ctx, pos);
    if (!control.ok) return control;
    const chosen = optional(quiet(CHOSEN_SUFFIX), undefined)(ctx, control.pos);
    if (!chosen.ok) return chosen;
    const compared = optional(quiet(comparisonSuffix(ALL_COMPARABLE)), undefined)(ctx, chosen.pos);
    if (!compared.ok) return compared;
    // "with mana value X" (stage P31): the X announced for the ability.
    const manaValueX =
      compared.value === undefined
        ? optional(quiet(MANA_VALUE_X), false)(ctx, compared.pos)
        : { ok: true as const, value: false, pos: compared.pos };
    if (!manaValueX.ok) return manaValueX;
    // "creatures you control with flying", "creatures with flying you control" (stage P29).
    const keyword = optional(quiet(KEYWORD_SUFFIX), undefined)(ctx, manaValueX.pos);
    if (!keyword.ok) return keyword;
    // "whose controller was dealt combat damage by ~ this turn" (stage P31).
    const damaged = optional(quiet(DAMAGED_BY_SOURCE), false)(ctx, keyword.pos);
    if (!damaged.ok) return damaged;
    // "creatures you control with a counter on it" (stage P32).
    const counter = optional(quiet(counterSuffix(plural)), undefined)(ctx, damaged.pos);
    if (!counter.ok) return counter;
    let controller = control.value;
    let end = counter.pos;
    // "creature of the chosen type you control", "creature with power 4 or greater you control".
    if (
      controller === undefined &&
      (chosen.value !== undefined ||
        compared.value !== undefined ||
        keyword.value !== undefined ||
        counter.value !== undefined)
    ) {
      const late = optional(EVENT_CONTROL_SUFFIX, undefined)(ctx, end);
      if (!late.ok) return late;
      controller = late.value;
      end = late.pos;
    }
    return {
      ok: true,
      value: {
        controller,
        chosen: chosen.value,
        compared: compared.value,
        keyword: keyword.value,
        manaValueX: manaValueX.value,
        damaged: damaged.value,
        counter: counter.value,
      },
      pos: end,
    };
  };
  const single: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(many(MODIFIER), nouns, tail)(ctx, pos);
    if (!r.ok) return r;
    const [
      modifiers,
      noun,
      { controller, chosen, compared, keyword, manaValueX, damaged, counter },
    ] = r.value;
    const parts = modifiers.reduce<FilterParts>((acc, m) => m(acc), {
      ...NO_PARTS,
      types: noun.types,
      controller,
      ...(keyword === undefined
        ? {}
        : keyword.has
          ? { keywords: [keyword.keyword] }
          : { notKeywords: [keyword.keyword] }),
    });
    const filter = toFilter('battlefield', parts, ctx.text.slice(pos, r.pos));
    return {
      ok: true,
      value: withComparison(
        {
          ...filter,
          ...(noun.subtypes.length > 0 ? { subtypes: noun.subtypes } : {}),
          ...(chosen === undefined ? {} : { chosen }),
          ...(manaValueX ? { manaValueX: true as const } : {}),
          ...(damaged ? { controllerDamagedBySource: true as const } : {}),
          ...(counter === undefined ? {} : { hasCounter: counter }),
        },
        compared,
      ),
      pos: r.pos,
    };
  };
  // "noncreature artifact or noncreature enchantment" (stage P15): a choice whose every member has
  // modifiers of its own. A modifier on the first member alone ("tapped creature or planeswalker") is
  // ambiguous and stays unread, so each member must carry at least one.
  const member: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      satisfy(many(MODIFIER), (modifiers) => modifiers.length > 0),
      typeWords(PERMANENT_TYPES, false),
    )(ctx, pos);
    if (!r.ok) return r;
    const [modifiers, types] = r.value;
    const parts = modifiers.reduce<FilterParts>((acc, m) => m(acc), { ...NO_PARTS, types });
    const { zone, ...filter } = toFilter('battlefield', parts, ctx.text.slice(pos, r.pos));
    void zone;
    return { ok: true, value: filter, pos: r.pos };
  };
  const modifiedChoice: Parser<IrFilter> = (ctx, pos) => {
    const first = member(ctx, pos);
    if (!first.ok) return first;
    const more = many(
      map(sequence(pattern(/(, or | or |, )/i), member), ([separator, filter]) => ({
        separator: separator[0].toLowerCase(),
        filter,
      })),
    )(ctx, first.pos);
    if (!more.ok) return more;
    const items = more.value;
    const last = items[items.length - 1];
    if (last === undefined) return fail(ctx, pos);
    const shaped =
      items.slice(0, -1).every((i) => i.separator === ', ') &&
      (items.length > 1 ? last.separator === ', or ' : last.separator === ' or ');
    if (!shaped) return fail(ctx, pos);
    const controller = optional(CONTROL_SUFFIX, undefined)(ctx, more.pos);
    if (!controller.ok) return controller;
    const base = toFilter(
      'battlefield',
      { ...NO_PARTS, controller: controller.value },
      ctx.text.slice(pos, controller.pos),
    );
    return {
      ok: true,
      value: { ...base, anyOf: [first.value, ...items.map((i) => i.filter)] },
      pos: controller.pos,
    };
  };
  // "Angel or Cleric you control" (stage P28): a choice of creature types (or other subtypes) for one object, each
  // word a listed subtype in the singular (CR 205.3).
  const subtypeChoice: Parser<IrFilter> = (ctx, pos) => {
    if (subtypes === false) return fail(ctx, pos);
    const r = sequence(
      satisfy(typeChoice(SUBTYPE_WORD, true), (words) =>
        words.every((w) => {
          const found = subtypeOf(w);
          return (
            found !== undefined &&
            found.plural !== true &&
            (subtypes === 'all' || !isBasicLandType(found.subtype))
          );
        }),
      ),
      optional(CONTROL_SUFFIX, undefined),
    )(ctx, pos);
    if (!r.ok) return r;
    const [words, controller] = r.value;
    const base = toFilter('battlefield', { ...NO_PARTS, controller }, ctx.text.slice(pos, r.pos));
    const anyOf = words.map((w): IrFilter => ({ subtypes: [w], raw: w }));
    return { ok: true, value: { ...base, anyOf }, pos: r.pos };
  };
  // "up to two target artifacts and/or enchantments" (stage P33, D-150, CR 115.1): the targets are each of one of the types.
  const pluralAndOr: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      typeChoice(`(?:${PERMANENT_TYPES})s`, false, 'and/or'),
      optional(CONTROL_SUFFIX, undefined),
    )(ctx, pos);
    if (!r.ok) return r;
    const [words, controller] = r.value;
    const base = toFilter('battlefield', { ...NO_PARTS, controller }, ctx.text.slice(pos, r.pos));
    const anyOf = words.map((w): IrFilter => {
      const type = w.slice(0, -1);
      return { types: [type], raw: type };
    });
    return { ok: true, value: { ...base, anyOf }, pos: r.pos };
  };
  // A choice of types is read for one object ("target artifact or enchantment"); plurals ("all
  // artifacts and enchantments") join with "and" and are not read.
  return plural
    ? choice(quiet(pluralAndOr), single)
    : choice(choose, quiet(modifiedChoice), quiet(subtypeChoice), single);
}

/**
 * "artifacts, creatures, and enchantments", "artifacts and enchantments you control" (stage P31, CR 205.2a): permanents of any of the
 * card types named, in the plural, joined by "and" as a group of objects is ("all artifacts and enchantments": every artifact and every
 * enchantment). Two or more plural type words with no modifier, then who controls them; the filter is a choice of the types (`anyOf`).
 */
export const PLURAL_TYPE_UNION: Parser<IrFilter> = (ctx, pos) => {
  const r = sequence(
    typeChoice(`(?:${PERMANENT_TYPES})s`, false, 'and'),
    optional(CONTROL_SUFFIX, undefined),
  )(ctx, pos);
  if (!r.ok) return r;
  const [words, controller] = r.value;
  const base = toFilter('battlefield', { ...NO_PARTS, controller }, ctx.text.slice(pos, r.pos));
  const anyOf = words.map((w): IrFilter => {
    const type = w.slice(0, -1);
    return { types: [type], raw: type };
  });
  return { ok: true, value: { ...base, anyOf }, pos: r.pos };
};

/** A subtype as written on a card: one capitalized word ("Aura", "Equipment"), CR 205.3. */
export const SUBTYPE_WORD = '[A-Z][a-z]+(?:-[A-Z][a-z]+)?';

/**
 * "spell", "noncreature spell", "creature spell", "blue spell", "instant or sorcery spell",
 * "enchantment, instant, or sorcery spell", "Aura, Equipment, or Vehicle spell" (CR 112.1: a spell
 * is a card on the stack; CR 205.2a: its card types are those of the card). What the words before
 * "spell" say is a filter of the spells, read on the stack (`zone: 'stack'`, `stackKind: 'spell'`):
 * a modifier and a type word, a choice of types, or a choice of subtypes. As for a permanent, a
 * choice takes no modifier ("tapped creature or planeswalker" is ambiguous), and "tapped" and
 * "untapped" say nothing about a spell.
 */
export function spellPhrase(plural = false): Parser<IrFilter> {
  // Stage P31: "artifact spells" (the spells a permission is about) with `plural`.
  const spellWord = pattern(new RegExp(`spell${plural ? 's' : ''}${BOUNDARY}`, 'iu'));
  const choose: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      choice(
        map(typeChoice(CARD_TYPES), (words) => ({ words, subtypes: false })),
        map(typeChoice(SUBTYPE_WORD, true), (words) => ({ words, subtypes: true })),
      ),
      literal(' '),
      spellWord,
    )(ctx, pos);
    if (!r.ok) return r;
    const { words, subtypes } = r.value[0];
    const base = toFilter('stack', NO_PARTS, ctx.text.slice(pos, r.pos));
    const anyOf = words.map(
      (w): IrFilter => (subtypes ? { subtypes: [w], raw: w } : { types: [w], raw: w }),
    );
    return { ok: true, value: { ...base, stackKind: 'spell', anyOf }, pos: r.pos };
  };
  const single: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      satisfy(
        map(many(MODIFIER), (modifiers) =>
          modifiers.reduce<FilterParts>((acc, m) => m(acc), NO_PARTS),
        ),
        (parts) => parts.tapped === undefined && parts.token === undefined && !parts.attacking,
      ),
      optional(
        map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([types]) => types),
        [] as string[],
      ),
      spellWord,
    )(ctx, pos);
    if (!r.ok) return r;
    const [parts, types] = r.value;
    const filter = toFilter('stack', { ...parts, types }, ctx.text.slice(pos, r.pos));
    return { ok: true, value: { ...filter, stackKind: 'spell' }, pos: r.pos };
  };
  const subtype: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      map(pattern(new RegExp(`${SUBTYPE_WORD}${BOUNDARY}`, 'u')), (m) => m[0]),
      literal(' '),
      // "Dragon creature spell" (stage P34, D-152): a creature type and then the card types.
      optional(
        map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([types]) => types),
        [] as string[],
      ),
      spellWord,
    )(ctx, pos);
    if (!r.ok) return r;
    const types = r.value[2];
    const filter = toFilter('stack', { ...NO_PARTS, types }, ctx.text.slice(pos, r.pos));
    return {
      ok: true,
      value: { ...filter, stackKind: 'spell', subtypes: [r.value[0]] },
      pos: r.pos,
    };
  };
  // "noncreature or Dragon spell" (stage P29, D-133): a choice whose members are not all of one kind, each a modifier and
  // a card type ("noncreature", "colorless artifact") or a subtype of the table ("Dragon"), CR 205.2a, 205.3.
  const mixed: Parser<IrFilter> = (ctx, pos) => {
    const item: Parser<IrFilter> = (c, at) => {
      const modifiers = many(MODIFIER)(c, at);
      if (!modifiers.ok) return modifiers;
      if (modifiers.value.length > 0) {
        const parts = modifiers.value.reduce<FilterParts>((acc, m) => m(acc), NO_PARTS);
        if (parts.tapped !== undefined || parts.token !== undefined || parts.attacking)
          return fail(c, at);
        const types = optional(typeWords(CARD_TYPES, false), [] as string[])(c, modifiers.pos);
        if (!types.ok) return types;
        const { zone, ...filter } = toFilter(
          'stack',
          { ...parts, types: types.value },
          c.text.slice(at, types.pos),
        );
        void zone;
        return { ok: true, value: filter, pos: types.pos };
      }
      const types = typeWords(CARD_TYPES, false)(c, at);
      if (types.ok)
        return {
          ok: true,
          value: { types: types.value, raw: c.text.slice(at, types.pos) },
          pos: types.pos,
        };
      const word = satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true)(c, at);
      if (!word.ok) return word;
      return {
        ok: true,
        value: { subtypes: [word.value.subtype], raw: c.text.slice(at, word.pos) },
        pos: word.pos,
      };
    };
    const first = item(ctx, pos);
    if (!first.ok) return first;
    const more = many(
      map(
        sequence(choice(literal(', or '), literal(' or '), literal('or '), literal(', ')), item),
        ([separator, member]) => ({ separator, member }),
      ),
    )(ctx, first.pos);
    if (!more.ok) return more;
    const members = [first.value, ...more.value.map((m) => m.member)];
    if (members.length < 2) return fail(ctx, pos);
    // "A or B", "A, B, or C": one " or " for two, commas and ", or " before the last for more (anything else is not
    // English). "or " without the space is the end of a modifier that took its own ("noncreature or Dragon").
    const joins = more.value.map((m) => m.separator.replace(/^ /, ''));
    const lastJoin = joins[joins.length - 1];
    const shaped =
      joins.slice(0, -1).every((j) => j === ', ') &&
      (joins.length > 1 ? lastJoin === ', or ' : lastJoin === 'or ' || lastJoin === 'or');
    if (!shaped) return fail(ctx, pos);
    const end = sequence(optional(literal(' '), ''), spellWord)(ctx, more.pos);
    if (!end.ok) return end;
    const base = toFilter('stack', NO_PARTS, ctx.text.slice(pos, end.pos));
    return { ok: true, value: { ...base, stackKind: 'spell', anyOf: members }, pos: end.pos };
  };
  // "creature spell of the chosen type" (stage P15, D-100); "spell with mana value 3 or less" (stage P18:
  // a spell on the stack has the mana value of its card, with the announced X, CR 202.3e).
  const base = choice(choose, single, subtype, mixed);
  return map(
    sequence(
      base,
      optional(quiet(CHOSEN_SUFFIX), undefined),
      optional(quiet(comparisonSuffix(['manaValue'])), undefined),
    ),
    ([filter, chosen, compared]) =>
      withComparison(chosen === undefined ? filter : { ...filter, chosen }, compared),
  );
}

/**
 * "instant and sorcery spells" (D-329, CR 106.6, 205.2a): the spells of a list of card types joined by "and", the plural only (a spell has one of
 * the types, so the list is a choice, as in "artifact or creature spells"). The filter is the choice `spellPhrase` reads for "or": `anyOf` of one
 * member for each type.
 */
export function spellTypesAndPhrase(): Parser<IrFilter> {
  return (ctx, pos) => {
    const r = sequence(
      typeChoice(CARD_TYPES, false, 'and'),
      literal(' '),
      pattern(new RegExp(`spells${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const words = r.value[0];
    const base = toFilter('stack', NO_PARTS, ctx.text.slice(pos, r.pos));
    const anyOf = words.map((w): IrFilter => ({ types: [w], raw: w }));
    return { ok: true, value: { ...base, stackKind: 'spell', anyOf }, pos: r.pos };
  };
}

/**
 * " that was put there from the battlefield this turn" (stage P37, D-180, CR 700.4): a card in a graveyard that went there from the battlefield
 * during this turn (a creature that died, an artifact that was destroyed).
 */
const PUT_THERE_THIS_TURN: Parser<boolean> = map(
  pattern(new RegExp(` that was put there from the battlefield this turn${BOUNDARY}`, 'iu')),
  () => true,
);

/** What stands before "card" in a graveyard phrase: types, a choice of types, subtypes (stage P15). */
interface CardWords {
  readonly types: readonly string[];
  readonly anyOf: readonly string[];
  readonly subtypes: readonly string[];
  /** Members of the choice that say more than a type (stage P68, D-230: "non-Aura enchantment"), after the types of `anyOf`. */
  readonly extra?: readonly IrFilter[];
  /** D-278: a choice of creature types ("Angel or Human creature card"): the card has one of them, besides the types. */
  readonly subtypeAnyOf?: readonly string[];
}

/**
 * "creature card from your graveyard" (CR 404.1): any owner's graveyard or only yours. The words
 * before "card" are a type ("creature"), a choice of types for one card ("instant or sorcery": the
 * card has either type, CR 205.2a; one card only, so not in the plural), creature types and a type
 * ("Zombie creature card"), or nothing.
 */
export function graveyardPhrase(
  plural: boolean,
  // D-362: "target creature cards in your graveyard" (Victimize, "Choose two target creature cards in your graveyard"): the same cards, said with "in".
  preposition: 'from' | 'in' = 'from',
): Parser<IrFilter> {
  const owner: Parser<'you' | 'opponent' | undefined> =
    preposition === 'in'
      ? map(literal(' in your graveyard'), () => 'you' as const)
      : choice(
          map(literal(' from your graveyard'), () => 'you' as const),
          map(literal(' from a graveyard'), () => undefined),
          map(pattern(/ from an opponent['’]s graveyard/i), () => 'opponent' as const),
          // "all creature cards from all graveyards" (stage P15): every graveyard, so no owner.
          ...(plural ? [map(literal(' from all graveyards'), () => undefined)] : []),
        );
  const choiceOfTypes: Parser<CardWords> = map(
    sequence(typeChoice(CARD_TYPES), literal(' ')),
    ([words]): CardWords => ({ types: [], anyOf: words, subtypes: [] }),
  );
  const typed: Parser<CardWords> = map(
    sequence(
      many(
        map(
          sequence(
            satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
            literal(' '),
          ),
          ([w]) => w.subtype,
        ),
      ),
      optional(
        map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([types]) => types),
        [] as string[],
      ),
    ),
    ([subtypes, types]): CardWords => ({ types, anyOf: [], subtypes }),
  );
  // "nonland permanent card" (stage P33, D-150, CR 110.1, 205.2a): a card that is a permanent card is of one of the permanent types, so the
  // words say a choice of them, less the types the modifiers leave out ("nonland": not a land card). An instant or a sorcery is no
  // permanent card, which a `notTypes` filter would not say.
  const permanentCards: Parser<CardWords> = (ctx, pos) => {
    const r = sequence(
      many(MODIFIER),
      pattern(new RegExp(`permanent${BOUNDARY}`, 'iu')),
      literal(' '),
    )(ctx, pos);
    if (!r.ok) return r;
    const parts = r.value[0].reduce<FilterParts>((acc, m) => m(acc), NO_PARTS);
    // Only the words that leave a type out: a color, a supertype or a state is more than this reading says.
    const plain =
      parts.colors.length === 0 &&
      parts.supertypes.length === 0 &&
      parts.tapped === undefined &&
      parts.token === undefined &&
      parts.notSubtypes.length === 0 &&
      !parts.colorless &&
      parts.notSupertypes.length === 0 &&
      !parts.attacking &&
      !parts.historic &&
      parts.colorCount === undefined;
    const left = PERMANENT_CARD_TYPES.filter((t) => !parts.notTypes.includes(t));
    if (!plain || left.length === 0) return fail(ctx, pos);
    return { ok: true, value: { types: [], anyOf: left, subtypes: [] }, pos: r.pos };
  };
  // "artifact, creature, or non-Aura enchantment card" (stage P68, D-230, CR 205.2a, 205.3h): a choice of card types in which the last is an enchantment that is no Aura.
  const withNonAura: Parser<CardWords> = (ctx, pos) => {
    const r = pattern(
      /((?:artifact|creature|land|planeswalker|battle)(?:, (?:artifact|creature|land|planeswalker|battle))*),? or non-Aura enchantment /iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const types = (r.value[1] ?? '').split(', ').map((t) => t.toLowerCase());
    if (new Set(types).size !== types.length) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        types: [],
        anyOf: types,
        subtypes: [],
        extra: [{ types: ['enchantment'], notSubtypes: ['Aura'], raw: 'non-Aura enchantment' }],
      },
      pos: r.pos,
    };
  };
  // "Angel or Human creature card" (D-278, CR 205.3m): a creature card that has either of two creature types ("target Angel or Human creature card from your
  // graveyard", Bruna's cast trigger). One card only, so not in the plural; the word "creature" must follow the types, so "Angel or Human card" alone and
  // "Angel or Human land card" are not read (a creature type on a card of another type is not built).
  const subtypeChoiceWords: Parser<CardWords> = (ctx, pos) => {
    const r = sequence(
      satisfy(typeChoice(SUBTYPE_WORD, true), (list) =>
        // Creature types only (a land or Aura type with a card type is another phrase).
        list.every((w) => {
          const found = readCreatureType(w);
          return found !== undefined && found.plural !== true;
        }),
      ),
      literal(' '),
      typeWords('creature', false),
      literal(' '),
    )(ctx, pos);
    if (!r.ok) return r;
    const [list, , types] = r.value;
    return {
      ok: true,
      value: { types, anyOf: [], subtypes: [], subtypeAnyOf: list },
      pos: r.pos,
    };
  };
  const words: Parser<CardWords> = plural
    ? choice(permanentCards, typed)
    : choice(permanentCards, withNonAura, choiceOfTypes, quiet(subtypeChoiceWords), typed);
  // "Dragon creature card or Ugin planeswalker card from your graveyard" (stage P34, D-152, CR 205.2a, 205.3j): one card that is either kind,
  // each kind a creature type and a card type ("Dragon creature card") or a planeswalker type ("Ugin planeswalker card"). Two or more kinds,
  // each with a type or a subtype; the owner follows the last.
  const kindOfCard: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(typed, pattern(new RegExp(`card${BOUNDARY}`, 'iu')))(ctx, pos);
    if (!r.ok) return r;
    const [{ types, subtypes }] = r.value;
    if (types.length === 0 && subtypes.length === 0) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        ...(types.length > 0 ? { types } : {}),
        ...(subtypes.length > 0 ? { subtypes } : {}),
        raw: ctx.text.slice(pos, r.pos),
      },
      pos: r.pos,
    };
  };
  const cardUnion: Parser<IrFilter> = (ctx, pos) => {
    const first = kindOfCard(ctx, pos);
    if (!first.ok) return first;
    const more = many(
      map(
        sequence(choice(literal(', or '), literal(' or '), literal(', ')), kindOfCard),
        ([sep, kind]) => ({
          sep,
          kind,
        }),
      ),
    )(ctx, first.pos);
    if (!more.ok) return more;
    const items = more.value;
    const last = items[items.length - 1];
    if (last === undefined) return fail(ctx, pos);
    // "A or B": one " or ". "A, B, or C": commas, then ", or " before the last (anything else is not English).
    const shaped =
      items.slice(0, -1).every((i) => i.sep === ', ') &&
      (items.length > 1 ? last.sep === ', or ' : last.sep === ' or ');
    if (!shaped) return fail(ctx, pos);
    const from = owner(ctx, more.pos);
    if (!from.ok) return from;
    const base = toFilter(
      'graveyard',
      { ...NO_PARTS, controller: from.value },
      ctx.text.slice(pos, from.pos),
    );
    return {
      ok: true,
      value: { ...base, card: true, anyOf: [first.value, ...items.map((i) => i.kind)] },
      pos: from.pos,
    };
  };
  const one: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      words,
      pattern(new RegExp(`card${plural ? 's' : ''}${BOUNDARY}`, 'iu')),
      // "creature card with mana value 3 or less from your graveyard" (stage P18): a card outside the
      // battlefield has its printed power, toughness and mana value (CR 202.3, 208.1).
      optional(quiet(comparisonSuffix(ALL_COMPARABLE)), undefined),
      // "with mana value X or less" (stage P68, D-230): at most the X a "where X is ..." says.
      optional(quiet(MANA_VALUE_X_OR_LESS), false),
      owner,
      // "... from an opponent's graveyard that was put there from the battlefield this turn" (stage P37, D-180, CR 700.4).
      optional(quiet(PUT_THERE_THIS_TURN), false),
    )(ctx, pos);
    if (!r.ok) return r;
    const [
      { types, anyOf, subtypes, extra, subtypeAnyOf },
      ,
      compared,
      atMostX,
      controller,
      putThere,
    ] = r.value;
    const filter = toFilter(
      'graveyard',
      { ...NO_PARTS, types, controller },
      ctx.text.slice(pos, r.pos),
    );
    return {
      ok: true,
      value: withComparison(
        {
          ...filter,
          ...(subtypes.length > 0 ? { subtypes } : {}),
          ...(anyOf.length > 0
            ? {
                anyOf: [...anyOf.map((t): IrFilter => ({ types: [t], raw: t })), ...(extra ?? [])],
              }
            : subtypeAnyOf === undefined
              ? {}
              : { anyOf: subtypeAnyOf.map((w): IrFilter => ({ subtypes: [w], raw: w })) }),
          ...(putThere ? { putFromBattlefieldThisTurn: true as const } : {}),
          ...(atMostX ? { manaValueAtMostX: true as const } : {}),
          card: true,
        },
        compared,
      ),
      pos: r.pos,
    };
  };
  return plural ? one : choice(quiet(cardUnion), one);
}

/** The same filter with no zone: for nouns that say what an object is, not where to look. */
export function withoutZone(filter: IrFilter): IrFilter {
  const { zone, ...rest } = filter;
  void zone;
  return rest;
}

/**
 * " that's green or blue", " that's white, blue, or black" (stage P48, D-205, CR 105.1, 105.2): the object has at least one of the colors named, which is
 * not what the engine's `colors` says (every one of them). The filter becomes a choice (`anyOf`) of the object with one of the colors: a choice of types
 * ("creature or planeswalker that's green or blue") gets one member for each type and color, a filter of one kind gets one member for each color. A filter that
 * already has a color of its own ("green creature that's blue or red") is not read.
 */
export function withColorList(phrase: Parser<IrFilter>): Parser<IrFilter> {
  const word = COLOR_WORDS.join('|');
  const list = new RegExp(
    `[ ]that['’]s (${word})(?: or (${word})|, (${word}), or (${word}))${BOUNDARY}`,
    'iu',
  );
  return (ctx, pos) => {
    const base = phrase(ctx, pos);
    if (!base.ok) return base;
    const tail = quiet(pattern(list))(ctx, base.pos);
    if (!tail.ok) return base;
    const colors = tail.value
      .slice(1)
      .filter((c): c is string => c !== undefined)
      .map((c) => c.toLowerCase());
    const filter = base.value;
    if (
      new Set(colors).size !== colors.length ||
      colors.length < 2 ||
      (filter.colors?.length ?? 0) > 0 ||
      filter.colorless === true ||
      filter.colorCount !== undefined
    ) {
      return base;
    }
    const raw = ctx.text.slice(pos, tail.pos);
    const members = filter.anyOf ?? [{ raw: '' }];
    const anyOf = members.flatMap((member) =>
      colors.map(
        (c): IrFilter => ({
          ...member,
          colors: [c],
          raw: member.raw === '' ? c : `${member.raw} ${c}`,
        }),
      ),
    );
    const { anyOf: _own, ...outer } = filter;
    void _own;
    return { ok: true, value: { ...outer, anyOf, raw }, pos: tail.pos };
  };
}

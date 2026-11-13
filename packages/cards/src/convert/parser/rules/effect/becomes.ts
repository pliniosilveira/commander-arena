/**
 * "Target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1
 * until end of turn" and its parts (CR 613.1d types, 613.1e colors, 613.1f abilities, 613.4b
 * base power and toughness; CR 611.2a duration). The subject is one object (the source, a target
 * or "it"), and every phrase of the sentence is said of it, so the clauses share one noun.
 *
 * What "becomes" can say is what the engine runs: a color or "colorless" (CR 105.3), creature types
 * (CR 205.3m, replacing the creature types and keeping the card types, CR 205.1a, 205.3d), and base
 * power and toughness. Since stage P6, `effect.becomes` also reads "an artifact creature" (with or
 * without "in addition to its other types") and "an artifact in addition to its other types", which
 * add to the types the object has (CR 205.1b). "A [creature type] artifact creature", "an artifact"
 * alone, "becomes a copy" and a duration other than "until end of turn" are not read.
 */
import {
  choice,
  fail,
  literal,
  many,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type {
  IrBasePt,
  IrClause,
  IrColorSpec,
  IrDuration,
  IrKeywordArg,
  IrNoun,
  IrTypeList,
  Span,
} from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { CREATURE_TYPES } from '../noun/creature-types';
import { BOUNDARY } from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';
import { SINGLE_SUBJECTS } from './pump';

const COLOR_WORDS = ['white', 'blue', 'black', 'red', 'green'] as const;

/** A color word, or "colorless", as the color words the IR keeps (none for colorless). */
export const COLOR: Parser<readonly string[]> = choice(
  ...COLOR_WORDS.map((word) =>
    map(pattern(new RegExp(`${word}${BOUNDARY}`, 'iu')), (): readonly string[] => [word]),
  ),
  map(pattern(new RegExp(`colorless${BOUNDARY}`, 'iu')), (): readonly string[] => []),
);

/**
 * One creature type, capitalized as in Oracle text and exactly as the CR lists it (CR 205.3m), in the singular: a
 * type of two words ("Time Lord") is one type (stage P29).
 */
const CREATURE_TYPE: Parser<string> = (ctx, pos) => {
  const word = SUBTYPE_WORD_NUMBERED(ctx, pos);
  if (!word.ok) return word;
  return CREATURE_TYPES.has(word.value.subtype) && word.value.plural !== true
    ? { ok: true, value: word.value.subtype, pos: word.pos }
    : fail(ctx, pos);
};

/** One or more creature types: "Frog", "Elk Wizard". */
export const CREATURE_TYPE_LIST: Parser<string[]> = (ctx, pos) => {
  const first = CREATURE_TYPE(ctx, pos);
  if (!first.ok) return first;
  const rest = many(map(sequence(literal(' '), CREATURE_TYPE), ([, type]) => type))(ctx, first.pos);
  if (!rest.ok) return rest;
  return { ok: true, value: [first.value, ...rest.value], pos: rest.pos };
};

const IN_ADDITION = new RegExp(
  ` in addition to (?:its|his|her|their) other types${BOUNDARY}`,
  'iu',
);

/** "base power and toughness 1/1" (CR 613.4b): plain numbers, never a change like "+1/+1". */
export const BASE_PT = (rule: string): Parser<IrBasePt> =>
  map(
    spanned(pattern(/base power and toughness (\d+)\/(\d+)(?![\p{L}\p{N}/])/iu)),
    ({ value, span }): IrBasePt => ({
      kind: 'basePt',
      power: Number(value[1]),
      toughness: Number(value[2]),
      span,
      rule,
    }),
  );

interface Becoming {
  readonly colors: IrColorSpec | null;
  readonly types: IrTypeList | null;
  readonly basePt: IrBasePt | null;
  readonly span: Span;
}

/**
 * What an object becomes: "a blue Frog", "a Frog with base power and toughness 1/1", "an Elk
 * Wizard", or a color alone ("blue", "colorless"). The article is "a" or "an" before a type; a
 * color alone has none.
 */
function becoming(rule: string, withCardTypes = false, numbered = false): Parser<Becoming> {
  const colorSpec = (span: Span, colors: readonly string[]): IrColorSpec => ({
    kind: 'colorSpec',
    colors,
    span,
    rule,
  });
  const typed = map(
    spanned(
      sequence(
        pattern(/an? /i),
        optional(spanned(sequence(COLOR, literal(' '))), null),
        spanned(CREATURE_TYPE_LIST),
        optional(
          map(sequence(literal(' with '), BASE_PT(rule)), ([, pt]) => pt),
          null,
        ),
        // "a Dragon in addition to his other types" (stage P29, CR 205.1b, 205.3d): the creature types are added
        // to the ones it has, whose pronoun is the object's own.
        withCardTypes
          ? optional(
              map(spanned(pattern(IN_ADDITION)), () => true as const),
              null,
            )
          : map(literal(''), () => null),
      ),
    ),
    ({ value, span }): Becoming => {
      const [, color, types, basePt, additive] = value;
      return {
        colors: color === null ? null : colorSpec(color.span, color.value[0]),
        types: {
          kind: 'typeList',
          subtypes: types.value,
          ...(additive === null ? {} : { additive: true }),
          span: types.span,
          rule,
        },
        basePt,
        span,
      };
    },
  );
  const colorOnly = map(
    spanned(COLOR),
    ({ value, span }): Becoming => ({
      colors: colorSpec(span, value),
      types: null,
      basePt: null,
      span,
    }),
  );
  // "an artifact creature" keeps every type the object had (CR 205.1b), so it is additive whether or
  // not the text says "in addition to its other types"; "an artifact" says it only with those words
  // (without them it would replace the card types, CR 205.1a, which is another effect).
  const numberedType = map(
    spanned(pattern(new RegExp(`an? (\\d+)\\/(\\d+) artifact creature${BOUNDARY}`, 'iu'))),
    ({ value, span }): Becoming => ({
      colors: null,
      // CR 205.1b: "becomes a 4/4 artifact creature" is an effect that states the object becomes an "artifact creature", which "also allow[s] the object to
      // retain all of its prior card types and subtypes": an artifact enchantment becomes an artifact enchantment creature. Additive, as the form without numbers.
      types: {
        kind: 'typeList',
        subtypes: [],
        cardTypes: ['artifact', 'creature'],
        additive: true,
        span,
        rule,
      },
      basePt: {
        kind: 'basePt',
        power: Number(value[1]),
        toughness: Number(value[2]),
        span,
        rule,
      },
      span,
    }),
  );
  const cardTypes = map(
    spanned(
      choice(
        map(
          sequence(
            pattern(
              new RegExp(
                `an artifact creature(?: in addition to its other types)?${BOUNDARY}`,
                'iu',
              ),
            ),
            // "becomes an artifact creature with base power and toughness 4/5" (stage P48, D-205, CR 613.4b): the layer 7b setting goes with the types.
            optional(
              map(sequence(literal(' with '), BASE_PT(rule)), ([, pt]) => pt),
              null,
            ),
          ),
          ([, pt]): { types: readonly string[]; pt: IrBasePt | null } => ({
            types: ['artifact', 'creature'],
            pt,
          }),
        ),
        map(
          pattern(new RegExp(`an artifact in addition to its other types${BOUNDARY}`, 'iu')),
          (): { types: readonly string[]; pt: IrBasePt | null } => ({
            types: ['artifact'],
            pt: null,
          }),
        ),
      ),
    ),
    ({ value, span }): Becoming => ({
      colors: null,
      types: { kind: 'typeList', subtypes: [], cardTypes: value.types, additive: true, span, rule },
      basePt: value.pt,
      span,
    }),
  );
  // "becomes a 4/4 artifact creature" (stage P64, D-217, CR 613.4b): only where the caller reads numbers (a group of permanents).
  return withCardTypes
    ? numbered
      ? choice(numberedType, cardTypes, typed, colorOnly)
      : choice(cardTypes, typed, colorOnly)
    : choice(typed, colorOnly);
}

function becomesClause(rule: string, subject: IrNoun, what: Becoming): IrClause {
  const args: Record<string, IrColorSpec | IrTypeList | IrBasePt | IrNoun> = { objects: subject };
  if (what.colors !== null) args.colors = what.colors;
  if (what.types !== null) args.types = what.types;
  if (what.basePt !== null) args.basePt = what.basePt;
  return makeClause(rule, 'becomes', args, what.span);
}

/** The verb with its leading space, so a subject with another verb fails where `effect.pump` fails. */
const LOSES = spanned(literal(' loses all abilities'));

/**
 * `effect.loses-abilities`: "target creature loses all abilities until end of turn" and, in the
 * words of Turn to Frog, "... and becomes a blue Frog with base power and toughness 1/1 until end
 * of turn" (CR 613.1f: abilities it has at that moment are gone, abilities granted later still
 * apply, CR 613.7).
 */
export const EFFECT_LOSES_ABILITIES = defineRule<Clauses>({
  id: 'effect.loses-abilities',
  family: 'effect',
  leading: ['~', 'target', 'it'],
  cites: [
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1e (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'target creature loses all abilities until end of turn',
    '~ loses all abilities until end of turn',
    'target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1 until end of turn',
    'target creature loses all abilities and becomes a Frog until end of turn',
    'target creature you control loses all abilities and becomes red until end of turn',
  ],
  rejects: [
    'target creature loses all abilities',
    'target creature loses all abilities until your next turn',
    'target creature loses flying until end of turn',
    'target creature lose all abilities until end of turn',
    'target creatures lose all abilities until end of turn',
    'target creature loses all abilities and has base power and toughness 1/1 until end of turn',
    'target creature loses all abilities and becomes an artifact creature until end of turn',
    'target creature loses all abilities and becomes a Frog in addition to its other types until end of turn',
    'target creature loses all other abilities until end of turn',
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.loses-abilities';
    const head = sequence(family<IrNoun>('noun', { only: SINGLE_SUBJECTS }), LOSES)(ctx, pos);
    if (!head.ok) return head;
    const [subject, loses] = head.value;
    const also = optional(
      map(sequence(literal(' and becomes '), becoming(rule)), ([, what]) => what),
      null,
    )(ctx, head.pos);
    if (!also.ok) return also;
    const tail = sequence(literal(' '), family<IrDuration>('duration'))(ctx, also.pos);
    if (!tail.ok) return tail;
    const [, duration] = tail.value;
    const lose = makeClause(rule, 'loseAllAbilities', { objects: subject }, loses.span);
    const clauses: IrClause[] =
      also.value === null
        ? [{ ...lose, duration }]
        : [
            { ...lose, duration, connector: 'and' },
            { ...becomesClause(rule, subject, also.value), duration },
          ];
    return { ok: true, value: clauses, pos: tail.pos };
  },
});

/**
 * `effect.becomes`: "target creature becomes a blue Frog until end of turn", "~ becomes a Frog
 * with base power and toughness 0/1 until end of turn", "target creature becomes red until end of
 * turn" (CR 613.1d, 613.1e, 205.1a, 105.3). A creature type replaces the creature types and leaves
 * the card types alone; a color replaces the colors.
 */
export const EFFECT_BECOMES = defineRule<Clauses>({
  id: 'effect.becomes',
  family: 'effect',
  leading: ['~', 'target', 'it'],
  cites: [
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1e (Interaction of Continuous Effects)',
    'CR 205.1a (Type Line)',
    'CR 205.3d (Subtypes)',
    'CR 105.3 (Colors)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'target creature becomes a blue Frog until end of turn',
    'target creature becomes a Frog with base power and toughness 0/1 until end of turn',
    'target creature becomes an Elk Wizard until end of turn',
    'target creature becomes red until end of turn',
    'target creature becomes colorless until end of turn',
    '~ becomes a blue Frog until end of turn',
    'it becomes a Frog until end of turn',
    'target creature becomes an artifact creature until end of turn',
    'target creature becomes an artifact creature in addition to its other types until end of turn',
    'target nonland permanent becomes an artifact in addition to its other types until end of turn',
    '~ becomes an artifact creature until end of turn',
    'target artifact or creature becomes an artifact creature with base power and toughness 4/5 until end of turn',
    'target creature becomes an artifact creature with base power and toughness 2/2 until end of turn',
  ],
  rejects: [
    'target creature becomes an artifact creature with base power and toughness 4/5',
    'target creature becomes an artifact creature with base power and toughness +4/+5 until end of turn',
    'target creature becomes an artifact creature with base power 4 until end of turn',
    'target creature becomes an artifact in addition to its other types with base power and toughness 4/5 until end of turn',
    'target creature becomes a blue Frog',
    'target creature becomes a Frog until your next turn',
    'target creature becomes an artifact until end of turn',
    'target creature becomes a Golem artifact creature until end of turn',
    'target creature becomes an artifact creature.',
    'target creature becomes a copy of target creature until end of turn',
    'target creature becomes a blue and black Frog until end of turn',
    'target creature becomes a Frogs until end of turn',
    'target creature becomes a Forest until end of turn',
    'target creature becomes a frog until end of turn',
    'target creature become a Frog until end of turn',
    'target creatures become Frogs until end of turn',
    'target creature becomes a 1/1 Frog until end of turn',
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.becomes';
    const r = sequence(
      family<IrNoun>('noun', { only: SINGLE_SUBJECTS }),
      literal(' becomes '),
      becoming(rule, true),
      literal(' '),
      family<IrDuration>('duration'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , what, , duration] = r.value;
    return { ok: true, value: [{ ...becomesClause(rule, subject, what), duration }], pos: r.pos };
  },
});

/**
 * `effect.base-pt`: "target creature has base power and toughness 4/4 until end of turn" (CR
 * 613.4b: layer 7b; counters and "+N/+N" effects still apply on top, CR 613.4c).
 */
export const EFFECT_BASE_PT = defineRule<Clauses>({
  id: 'effect.base-pt',
  family: 'effect',
  leading: ['~', 'target', 'it'],
  cites: [
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'target creature has base power and toughness 4/4 until end of turn',
    '~ has base power and toughness 0/1 until end of turn',
    'it has base power and toughness 2/2 until end of turn',
  ],
  rejects: [
    'target creature has base power and toughness 4/4',
    'target creature has base power and toughness +4/+4 until end of turn',
    'target creature has base power and toughness X/X until end of turn',
    'target creature has base power 4 until end of turn',
    'target creature have base power and toughness 4/4 until end of turn',
    'target creatures have base power and toughness 4/4 until end of turn',
    'target creature has base power and toughness 4/4 until your next turn',
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.base-pt';
    const r = sequence(
      family<IrNoun>('noun', { only: SINGLE_SUBJECTS }),
      literal(' has '),
      BASE_PT(rule),
      literal(' '),
      family<IrDuration>('duration'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , basePt, , duration] = r.value;
    const clause = makeClause(rule, 'setPt', { objects: subject, basePt }, basePt.span);
    return { ok: true, value: [{ ...clause, duration }], pos: r.pos };
  },
});

/**
 * `effect.lead-becomes`: "Until end of turn, ~ becomes a Dragon in addition to his other types and gains flying.", "Until
 * end of turn, it becomes a blue Frog.": the duration first (stage P29), then what `effect.becomes` reads and, when the
 * text says it, keywords the same object gains. The same continuous effects as `effect.becomes` and
 * `effect.gain-keyword`, one clause each, said in the other order of words (CR 611.2a, 613.1d, 613.1f).
 */
export const EFFECT_LEAD_BECOMES = defineRule<Clauses>({
  id: 'effect.lead-becomes',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    'Until end of turn, ~ becomes a Dragon in addition to his other types and gains flying',
    'Until end of turn, ~ becomes a Dragon in addition to its other types',
    'Until end of turn, it becomes a Frog and gains haste',
    'Until end of turn, ~ becomes a Time Lord in addition to its other types and gains flying and trample',
  ],
  rejects: [
    'Until end of turn, ~ becomes a Dragon in addition to his other types and gains flying until end of turn',
    'Until end of turn, target creature becomes a Dragon and gains flying',
    'Until end of turn, ~ becomes a Dragon and gains flash',
    'Until end of turn ~ becomes a Dragon',
    'Until end of turn, ~ becomes a Dragon and gains',
    'Until your next turn, ~ becomes a Dragon',
    'Until end of turn, ~ becomes a Dragons',
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.lead-becomes';
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      family<IrNoun>('noun', { only: ['noun.self', 'noun.it'] }),
      literal(' becomes '),
      becoming(rule, true),
      optional(spanned(sequence(literal(' and gains '), KEYWORD_WORDS)), null),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , what, gains] = r.value;
    const clauses: IrClause[] = [
      {
        ...becomesClause(rule, subject, what),
        duration,
        ...(gains === null ? {} : { connector: 'and' as const }),
      },
    ];
    if (gains !== null) {
      const words = gains.value[1];
      words.forEach((name, i) => {
        const keyword = { kind: 'keywordName' as const, name, span: gains.span, rule };
        const clause = makeClause(rule, 'grantKeyword', { objects: subject, keyword }, gains.span);
        clauses.push({
          ...clause,
          duration,
          ...(i < words.length - 1 ? { connector: 'and' as const } : {}),
        });
      });
    }
    return { ok: true, value: clauses, pos: r.pos };
  },
});

/**
 * `effect.lead-becomes-target`: "Until end of turn, target artifact or creature becomes an artifact creature with base power and toughness 4/5."
 * (stage P48, D-205, CR 611.2a, 613.1d, 613.4b, 205.1b): the duration first, then what `effect.becomes` reads of a target. "An artifact creature"
 * keeps every type the permanent had (CR 205.1b), so an artifact that is no creature becomes one and a creature that is no artifact becomes both.
 * The same continuous effects as `effect.becomes`, said in the other order of words.
 *
 * D-1124 (CR 205.1b, 613.1d, 613.1f, 611.2a): "Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying,
 * first strike, lifelink, and hexproof." The creature types it becomes, in addition to the others, and then the keywords it gains: the same target for every part
 * (one noun, one chosen target, CR 115.1), the same duration. Only after creature types said "in addition to its other types": "becomes an artifact creature and
 * gains flying" and a replacing "becomes a Frog and gains flying" stay unread.
 */
export const EFFECT_LEAD_BECOMES_TARGET = defineRule<Clauses>({
  id: 'effect.lead-becomes-target',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    'Until end of turn, target artifact or creature becomes an artifact creature with base power and toughness 4/5',
    'Until end of turn, target creature becomes an artifact creature',
    'Until end of turn, target creature becomes a blue Frog with base power and toughness 1/1',
    'Until end of turn, target creature becomes red',
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof',
    'Until end of turn, target creature becomes a Wizard in addition to its other types and gains flying',
  ],
  rejects: [
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof until end of turn',
    'Until end of turn, target creature you control becomes an Avatar and gains flying',
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains',
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying and draws a card',
    'Until end of turn, target creature you control becomes an Avatar in addition to its other types and has flying',
    'Until end of turn, target creature you control becomes an artifact creature in addition to its other types and gains flying',
    'Until end of turn, target creature you control becomes red and gains flying',
    'Until end of turn, target artifact or creature becomes an artifact creature with base power and toughness 4/5 until end of turn',
    'Until end of turn target creature becomes an artifact creature',
    'Until your next turn, target creature becomes an artifact creature',
    'Until end of turn, target creature becomes an artifact',
    'Until end of turn, target creatures become artifact creatures',
    'Until end of turn, target creature becomes a copy of target creature',
    'Until end of turn, target creature becomes an artifact creature and gains flying',
    'Until end of turn, ~ becomes an artifact creature',
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.lead-becomes-target';
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      literal(' becomes '),
      becoming(rule, true),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , what] = r.value;
    const becomes = becomesClause(rule, subject, what);
    // D-1124: "... in addition to its other types and gains flying, first strike, lifelink, and hexproof": a grant of each keyword to the same subject.
    const gains =
      what.types !== null && what.types.additive === true && what.types.subtypes.length > 0
        ? optional(
            spanned(map(sequence(literal(' and gains '), KEYWORD_WORDS), ([, words]) => words)),
            null,
          )(ctx, r.pos)
        : ({ ok: true, value: null, pos: r.pos } as const);
    if (!gains.ok) return gains;
    if (gains.value === null) return { ok: true, value: [{ ...becomes, duration }], pos: r.pos };
    const span = gains.value.span;
    const clauses: IrClause[] = [{ ...becomes, duration, connector: 'and' }];
    gains.value.value.forEach((name, i, all) => {
      const keyword: IrKeywordArg = { kind: 'keywordName', name, span, rule };
      const grant = makeClause(rule, 'grantKeyword', { objects: subject, keyword }, span);
      clauses.push({ ...grant, duration, ...(i < all.length - 1 ? { connector: 'and' } : {}) });
    });
    return { ok: true, value: clauses, pos: gains.pos };
  },
});

/**
 * `effect.have-base-pt`: "have ~'s base power and toughness become 4/2 until end of turn" (stage P48, D-205, CR 613.4b, 611.2a), the words after "you may" of
 * "you may have this creature's base power and toughness become 4/2 until end of turn": the same continuous effect as `effect.base-pt`, said of `~`
 * with "have" (the instruction is optional by its "you may", which the sentence reads). Only `~`: another creature would need its own possessive.
 */
export const EFFECT_HAVE_BASE_PT = defineRule<Clauses>({
  id: 'effect.have-base-pt',
  family: 'effect',
  leading: ['have'],
  cites: [
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    "have ~'s base power and toughness become 4/2 until end of turn",
    'have ~’s base power and toughness become 0/4 until end of turn',
  ],
  rejects: [
    "have ~'s base power and toughness become 4/2",
    "have ~'s base power and toughness become 4/2 until your next turn",
    "have ~'s base power and toughness become +4/+2 until end of turn",
    "have ~'s base power and toughness become X/X until end of turn",
    "have ~'s base power become 4 until end of turn",
    "have target creature's base power and toughness become 4/2 until end of turn",
    'have its base power and toughness become 4/2 until end of turn',
    "have ~'s power and toughness become 4/2 until end of turn",
    'have ~ base power and toughness become 4/2 until end of turn',
    "has ~'s base power and toughness become 4/2 until end of turn",
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.have-base-pt';
    const r = sequence(
      literal('have '),
      // Read here and not as `noun.self`: the rules of the noun family are found by the word they start with, and "~'s" is not "~".
      map(
        spanned(literal('~')),
        ({ span }): IrNoun => ({
          kind: 'noun',
          det: 'self',
          filter: { raw: '~' },
          upTo: false,
          plural: false,
          other: false,
          span,
          rule,
        }),
      ),
      pattern(/['’]s base power and toughness become (\d+)\/(\d+)(?![\p{L}\p{N}/])/iu),
      literal(' '),
      family<IrDuration>('duration'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, subject, pt, , duration] = r.value;
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt[1]),
      toughness: Number(pt[2]),
      span: { start: subject.span.end, end: r.pos },
      rule,
    };
    const clause = makeClause(rule, 'setPt', { objects: subject, basePt }, basePt.span);
    return { ok: true, value: [{ ...clause, duration }], pos: r.pos };
  },
});

/**
 * `effect.each-becomes`: "each noncreature artifact you control becomes a 4/4 artifact creature until end of turn" (stage P64, D-217, CR 613.1d, 613.4b,
 * 611.2c: the permanents it affects are those the group names as it resolves). The subject is a group of permanents; what it becomes is what
 * `effect.becomes` reads of one. The numbers are required (a creature needs a power and a toughness). Not read: a creature type, a color, "all" and the plural verb.
 */
export const EFFECT_EACH_BECOMES = defineRule<Clauses>({
  id: 'effect.each-becomes',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    'each noncreature artifact you control becomes a 4/4 artifact creature until end of turn',
    'each artifact you control becomes a 3/3 artifact creature until end of turn',
  ],
  rejects: [
    'each artifact you control becomes an artifact creature until end of turn',
    'each noncreature artifact you control becomes a 4/4 artifact creature',
    'each noncreature artifact you control become 4/4 artifact creatures until end of turn',
    'each noncreature artifact you control becomes a 4/4 Golem artifact creature until end of turn',
    'each noncreature artifact you control becomes a 4/4 artifact creature until your next turn',
    'each creature becomes a blue Frog until end of turn',
    'all artifacts you control become 4/4 artifact creatures until end of turn',
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.each-becomes';
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.each-permanent'] }),
      literal(' becomes '),
      // Only what a group can become: the artifact creature (with its numbers), not a color or a creature type.
      satisfy(
        becoming(rule, true, true),
        (what) => what.types?.cardTypes !== undefined && what.basePt !== null,
      ),
      literal(' '),
      family<IrDuration>('duration'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , what, , duration] = r.value;
    return { ok: true, value: [{ ...becomesClause(rule, subject, what), duration }], pos: r.pos };
  },
});

export const BECOMES_RULES = [
  EFFECT_LOSES_ABILITIES,
  EFFECT_BECOMES,
  EFFECT_EACH_BECOMES,
  EFFECT_BASE_PT,
  EFFECT_LEAD_BECOMES,
  EFFECT_LEAD_BECOMES_TARGET,
  EFFECT_HAVE_BASE_PT,
];

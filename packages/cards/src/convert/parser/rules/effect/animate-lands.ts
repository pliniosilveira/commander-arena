/**
 * Effect rules that turn lands into creatures for a while (Embodiment of Fury, Embodiment of Insight, Sylvan Awakening; issue 692): "have target land you control become a
 * 3/3 Elemental creature with haste until end of turn. It's still a land." and "Until your next turn, all lands you control become 2/2 Elemental creatures with reach, indestructible, and
 * haste. They're still lands." The engine runs the additive `setTypes` (with its base power and toughness) and `grantKeyword`; only the words are new. The second sentence says the land
 * keeps its types, which the additive form already does (CR 205.1b), and the segmenter keeps it with the first.
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
import type {
  IrBasePt,
  IrClause,
  IrDuration,
  IrFilter,
  IrKeywordArg,
  IrNoun,
  IrTypeList,
  Span,
} from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

const MORE_AFTER = /^(?:,| and\b| then\b)/iu;

/** A subject that is lands only (a filter of the card type land and nothing that changes what "lands" means): the second sentence says "still a land". */
const isLands = (filter: IrFilter): boolean =>
  filter.types?.length === 1 && filter.types[0] === 'land';

/**
 * The clauses of "[subject] become(s) a N/N <creature types> creature(s) [with <keywords>] <duration>": one `becomes` clause (additive creature type with the base power and
 * toughness, CR 205.1b, 613.4b) and one `grantKeyword` clause for each keyword, all for the same duration.
 */
function animation(
  rule: string,
  subject: IrNoun,
  pt: { readonly value: RegExpExecArray; readonly span: Span },
  types: { readonly value: string[]; readonly span: Span },
  keywords: { readonly value: readonly string[]; readonly span: Span } | null,
  duration: IrDuration,
): IrClause[] {
  const basePt: IrBasePt = {
    kind: 'basePt',
    power: Number(pt.value[1]),
    toughness: Number(pt.value[2]),
    span: pt.span,
    rule,
  };
  const typeList: IrTypeList = {
    kind: 'typeList',
    subtypes: types.value,
    cardTypes: ['creature'],
    additive: true,
    span: types.span,
    rule,
  };
  const head = makeClause(
    rule,
    'becomes',
    { objects: subject, types: typeList, basePt },
    types.span,
  );
  const clauses: IrClause[] = [
    {
      ...head,
      duration,
      ...(keywords === null ? {} : { connector: 'and' as const }),
    },
  ];
  if (keywords !== null) {
    keywords.value.forEach((name, i, all) => {
      const keyword: IrKeywordArg = { kind: 'keywordName', name, span: keywords.span, rule };
      clauses.push({
        ...makeClause(rule, 'grantKeyword', { objects: subject, keyword }, keywords.span),
        duration,
        ...(i < all.length - 1 ? { connector: 'and' as const } : {}),
      });
    });
  }
  return clauses;
}

const ID_TARGET = 'effect.may-have-target-land-become-creature';

/**
 * `effect.may-have-target-land-become-creature`: "have target land you control become a 3/3 Elemental creature with haste until end of turn. It's still a land." (CR 205.1b,
 * 611.2a, 613.1d, 613.4b, 608.2d): the land the text names is, for the duration, a creature of the type with the base power and toughness and the keywords, and still a land (the card types
 * are added to, not replaced). The sentence parser reads the "you may" before it and marks the clauses optional. Not read: a subject that is not one target land, a creature type left out, no base power and toughness, a second
 * sentence that is not "It's still a land", something after the sentence.
 */
export const EFFECT_MAY_HAVE_TARGET_LAND_BECOME_CREATURE = defineRule<Clauses>({
  id: ID_TARGET,
  family: 'effect',
  leading: ['have'],
  cites: [
    'CR 205.1b (Type Line)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    "have target land you control become a 3/3 Elemental creature with haste until end of turn. It's still a land",
    'have target land you control become a 4/4 Elemental creature until end of turn. It’s still a land',
    "have target land you control become a 2/2 Elemental creature with flying and haste until end of turn. It's still a land",
  ],
  rejects: [
    'have target land you control become a 3/3 Elemental creature with haste until end of turn',
    "have target land you control become a 3/3 Elemental creature with haste. It's still a land",
    "have target land you control become a 3/3 Elemental creature with haste until your next turn. It's still a land",
    "have target land you control become a 3/3 creature with haste until end of turn. It's still a land",
    "have target land you control become a Elemental creature with haste until end of turn. It's still a land",
    "have target land you control become a 3/3 Elemental creature with haste until end of turn. It's still a creature",
    "have target creature you control become a 3/3 Elemental creature with haste until end of turn. It's still a land",
    "have target land you control become a 3/3 Elemental creature with sparkle until end of turn. It's still a land",
    "have target land you control become a 3/3 Elemental creature with haste until end of turn. It's still a land and gains flying",
    "have target lands you control become a 3/3 Elemental creature with haste until end of turn. It's still a land",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('have '),
      satisfy(family<IrNoun>('noun', { only: ['noun.target-permanent'] }), (n) =>
        isLands(n.filter),
      ),
      literal(' become a '),
      spanned(pattern(/(\d+)\/(\d+) /u)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature'),
      optional(spanned(sequence(literal(' with '), KEYWORD_WORDS)), null),
      literal(' '),
      family<IrDuration>('duration'),
      pattern(/\. it['’]s still a land(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    if (MORE_AFTER.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const [, subject, , pt, types, , keywords, , duration] = r.value;
    const words = keywords === null ? null : { value: keywords.value[1], span: keywords.span };
    return {
      ok: true,
      value: animation(ID_TARGET, subject, pt, types, words, duration),
      pos: r.pos,
    };
  },
});

const ID_ALL = 'effect.all-lands-become-creatures';

/** "until your next turn" (CR 500.1, 611.2a): the duration family reads only "until end of turn", so the rules that need this one read it themselves. */
const UNTIL_YOUR_NEXT_TURN: Parser<IrDuration> = map(
  spanned(pattern(/until your next turn(?![\p{L}\p{N}])/iu)),
  ({ span }): IrDuration => ({ kind: 'duration', scope: 'untilYourNextTurn', span, rule: ID_ALL }),
);

const DURATION: Parser<IrDuration> = choice(family<IrDuration>('duration'), UNTIL_YOUR_NEXT_TURN);

/**
 * `effect.all-lands-become-creatures`: "Until your next turn, all lands you control become 2/2 Elemental creatures with reach, indestructible, and haste. They're still lands." (also with the
 * duration at the end: "All lands you control become ... until end of turn. They're still lands."; CR 205.1b, 611.2a, 611.2c, 613.1d, 613.4b): the lands the group names as the
 * effect resolves are, for the duration, creatures of the type with the base power and toughness and the keywords, and still lands. Not read: a group that is not lands, the singular
 * words, a creature type or the numbers left out, "They're still" of another kind, something after the sentence.
 */
export const EFFECT_ALL_LANDS_BECOME_CREATURES = defineRule<Clauses>({
  id: ID_ALL,
  family: 'effect',
  leading: ['until', 'all'],
  cites: [
    'CR 205.1b (Type Line)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
  ],
  examples: [
    "Until your next turn, all lands you control become 2/2 Elemental creatures with reach, indestructible, and haste. They're still lands",
    "until end of turn, all lands you control become 3/3 Elemental creatures with haste. They're still lands",
    "all lands you control become 2/2 Elemental creatures until end of turn. They're still lands",
    'Until your next turn, all lands you control become 2/2 Elemental creatures with reach and haste. They’re still lands',
  ],
  rejects: [
    'Until your next turn, all lands you control become 2/2 Elemental creatures with reach, indestructible, and haste',
    "Until your next turn, all lands you control become 2/2 Elemental creatures with reach, indestructible, and haste. They're lands",
    "all lands you control become 2/2 Elemental creatures with haste. They're still lands",
    "Until your next turn, all artifacts you control become 2/2 Elemental creatures with haste. They're still lands",
    "Until your next turn, all lands you control become 2/2 creatures with haste. They're still lands",
    "Until your next turn, all lands you control become Elemental creatures with haste. They're still lands",
    "Until your next turn, all lands you control become 2/2 Elemental creatures with sparkle. They're still lands",
    "Until your next turn, all lands you control become 2/2 Elemental creatures with haste. They're still lands and gain flying",
    "Until your next turn, all lands you control become a 2/2 Elemental creature with haste. It's still a land",
    "Until your next turn, all lands become 2/2 Elemental creatures with haste. They're still lands until end of turn",
  ],
  parse: (ctx, pos) => {
    const lead = optional(sequence(DURATION, literal(', ')), null)(ctx, pos);
    if (!lead.ok) return lead;
    const subjectAt = lead.value === null ? pos : lead.pos;
    const r = sequence(
      satisfy(family<IrNoun>('noun', { only: ['noun.all-permanents'] }), (n) => isLands(n.filter)),
      literal(' become '),
      spanned(pattern(/(\d+)\/(\d+) /u)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creatures'),
      optional(spanned(sequence(literal(' with '), KEYWORD_WORDS)), null),
    )(ctx, subjectAt);
    if (!r.ok) return r;
    const [subject, , pt, types, , keywords] = r.value;
    let duration: IrDuration;
    let end = r.pos;
    if (lead.value !== null) {
      duration = lead.value[0];
    } else {
      const trailing = sequence(literal(' '), DURATION)(ctx, end);
      if (!trailing.ok) return trailing;
      duration = trailing.value[1];
      end = trailing.pos;
    }
    const still = pattern(/\. they['’]re still lands(?![\p{L}\p{N}])/iu)(ctx, end);
    if (!still.ok) return still;
    if (MORE_AFTER.test(ctx.text.slice(still.pos))) return fail(ctx, pos);
    const words = keywords === null ? null : { value: keywords.value[1], span: keywords.span };
    return {
      ok: true,
      value: animation(ID_ALL, subject, pt, types, words, duration),
      pos: still.pos,
    };
  },
});

export const ANIMATE_LANDS_EFFECT_RULES = [
  EFFECT_MAY_HAVE_TARGET_LAND_BECOME_CREATURE,
  EFFECT_ALL_LANDS_BECOME_CREATURES,
];

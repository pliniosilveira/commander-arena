/**
 * Effect rule of the Multiverse Reforged deck (issue 81, Restless Anchorage): a land that becomes a creature with keywords until end of turn.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type {
  IrBasePt,
  IrClause,
  IrColorSpec,
  IrDuration,
  IrNoun,
  IrTypeList,
} from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.lead-becomes-land-creature-keywords';

/**
 * `effect.lead-becomes-land-creature-keywords`: "Until end of turn, ~ becomes a 2/3 white and blue Bird creature with flying. It's still a land." (CR 613.1d, 613.1e, 613.1f, 613.4b, 205.1b,
 * 611.2a): a land that is also a creature until the end of the turn, with the base power and toughness, the colors, the creature types and the keywords the text says (the keywords of
 * the creature itself, not an ability in quotes: that is `effect.lead-becomes-land-creature`). "It's still a land" says its types are added to, not replaced (CR 205.1b). Only `~` itself.
 * Not read: another duration, another subject, no colors, no creature type, no keyword, "that's still a land", the second sentence left out.
 */
export const EFFECT_LEAD_BECOMES_LAND_CREATURE_KEYWORDS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    "until end of turn, ~ becomes a 2/3 white and blue Bird creature with flying. It's still a land",
    'Until end of turn, ~ becomes a 2/3 white and blue Bird creature with flying. It’s still a land',
    "Until end of turn, ~ becomes a 3/3 green Elemental creature with flying and haste. It's still a land",
  ],
  rejects: [
    'Until end of turn, ~ becomes a 2/3 white and blue Bird creature with flying.',
    "Until end of turn, ~ becomes a 2/3 white and blue Bird creature with flying. It's still a planeswalker",
    "Until your next turn, ~ becomes a 2/3 white and blue Bird creature with flying. It's still a land",
    "Until end of turn, target land becomes a 2/3 white and blue Bird creature with flying. It's still a land",
    "Until end of turn, ~ becomes a white and blue Bird creature with flying. It's still a land",
    "Until end of turn, ~ becomes a 2/3 Bird creature with flying. It's still a land",
    "Until end of turn, ~ becomes a 2/3 white and blue creature with flying. It's still a land",
    "Until end of turn, ~ becomes a 2/3 white and blue Bird creature. It's still a land",
    "Until end of turn, ~ becomes a 2/3 white and blue Bird creature with flying. It's still a land and you draw a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(
        pattern(
          /(white|blue|black|red|green)(?: and (white|blue|black|red|green))?(?![\p{L}\p{N}]) /iu,
        ),
      ),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature with '),
      spanned(KEYWORD_WORDS),
      pattern(/\. It['’]s still a land(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , pt, colorWords, types, , keywords] = r.value;
    const colors = [colorWords.value[1], colorWords.value[2]]
      .filter((c): c is string => c !== undefined)
      .map((c) => c.toLowerCase());
    if (new Set(colors).size !== colors.length) return fail(ctx, pos);
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true,
      span: types.span,
      rule: ID,
    };
    const colorSpec: IrColorSpec = { kind: 'colorSpec', colors, span: colorWords.span, rule: ID };
    const clauses: IrClause[] = [
      {
        ...makeClause(
          ID,
          'becomes',
          { objects: subject, types: typeList, colors: colorSpec, basePt },
          types.span,
        ),
        duration,
        connector: 'and' as const,
      },
    ];
    keywords.value.forEach((name, i) => {
      const keyword = { kind: 'keywordName' as const, name, span: keywords.span, rule: ID };
      clauses.push({
        ...makeClause(ID, 'grantKeyword', { objects: subject, keyword }, keywords.span),
        duration,
        ...(i < keywords.value.length - 1 ? { connector: 'and' as const } : {}),
      });
    });
    return { ok: true, value: clauses, pos: r.pos };
  },
});

const TRAILING_ID = 'effect.becomes-land-creature-trailing';

/**
 * `effect.becomes-land-creature-trailing`: "~ becomes a 3/3 green and white Llama creature until end of turn. It's still a land." (CR 613.1d, 613.1e, 613.4b, 205.1b, 611.2a): the
 * same land creature as `effect.lead-becomes-land-creature-keywords`, with the duration after the creature, no keyword and no quoted ability. Only `~` itself, only "until end of turn".
 * Not read: another duration, another subject, no colors, no creature type, a keyword, "that's still a land", the second sentence left out.
 */
export const EFFECT_BECOMES_LAND_CREATURE_TRAILING = defineRule<Clauses>({
  id: TRAILING_ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1e (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    "~ becomes a 3/3 green and white Llama creature until end of turn. It's still a land",
    '~ becomes a 3/3 green and white Llama creature until end of turn. It’s still a land',
    "~ becomes a 2/2 blue Elemental creature until end of turn. It's still a land",
  ],
  rejects: [
    '~ becomes a 3/3 green and white Llama creature until end of turn.',
    "~ becomes a 3/3 green and white Llama creature until your next turn. It's still a land",
    "target land becomes a 3/3 green and white Llama creature until end of turn. It's still a land",
    "~ becomes a green and white Llama creature until end of turn. It's still a land",
    "~ becomes a 3/3 Llama creature until end of turn. It's still a land",
    "~ becomes a 3/3 green and white creature until end of turn. It's still a land",
    "~ becomes a 3/3 green and white Llama creature with flying until end of turn. It's still a land",
    "~ becomes a 3/3 green and white Llama creature until end of turn. It's still a land and you draw a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(
        pattern(
          /(white|blue|black|red|green)(?: and (white|blue|black|red|green))?(?![\p{L}\p{N}]) /iu,
        ),
      ),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature '),
      family<IrDuration>('duration'),
      pattern(/\. It['’]s still a land(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , pt, colorWords, types, , duration] = r.value;
    const colors = [colorWords.value[1], colorWords.value[2]]
      .filter((c): c is string => c !== undefined)
      .map((c) => c.toLowerCase());
    if (new Set(colors).size !== colors.length) return fail(ctx, pos);
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: TRAILING_ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true,
      span: types.span,
      rule: TRAILING_ID,
    };
    const colorSpec: IrColorSpec = {
      kind: 'colorSpec',
      colors,
      span: colorWords.span,
      rule: TRAILING_ID,
    };
    const clause: IrClause = {
      ...makeClause(
        TRAILING_ID,
        'becomes',
        { objects: subject, types: typeList, colors: colorSpec, basePt },
        types.span,
      ),
      duration,
    };
    return { ok: true, value: [clause], pos: r.pos };
  },
});

const IT_ID = 'effect.it-becomes-land-creature-keywords';

/**
 * `effect.it-becomes-land-creature-keywords`: "It becomes an 8/8 Elemental creature with trample and haste until end of turn. It's still a land." (issue 345, Silvanus's Invoker; CR
 * 613.1d, 613.1f, 613.4b, 205.1b, 611.2a): the land the instruction before it named ("Untap target land you control.") is also a creature until the end of the turn, with the base power and
 * toughness, the creature types and the keywords the text says and its colors unchanged. "It's still a land" says its types are added to, not replaced. Only "it", with no colors. Not
 * read: another duration, another subject, a color, no creature type, no keyword, no base power and toughness, the second sentence left out, "that's still a land".
 */
export const EFFECT_IT_BECOMES_LAND_CREATURE_KEYWORDS = defineRule<Clauses>({
  id: IT_ID,
  family: 'effect',
  leading: ['it'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    "it becomes an 8/8 Elemental creature with trample and haste until end of turn. It's still a land",
    'It becomes a 3/3 Elemental creature with haste until end of turn. It’s still a land',
  ],
  rejects: [
    'it becomes an 8/8 Elemental creature with trample and haste until end of turn.',
    "it becomes an 8/8 Elemental creature with trample and haste until end of turn. It's still a creature",
    "it becomes an 8/8 Elemental creature with trample and haste until your next turn. It's still a land",
    "it becomes an 8/8 green Elemental creature with trample and haste until end of turn. It's still a land",
    "it becomes an Elemental creature with trample and haste until end of turn. It's still a land",
    "it becomes an 8/8 creature with trample and haste until end of turn. It's still a land",
    "it becomes an 8/8 Elemental creature until end of turn. It's still a land",
    "target land becomes an 8/8 Elemental creature with trample and haste until end of turn. It's still a land",
    "it becomes an 8/8 Elemental creature with trample and haste until end of turn. It's still a land and draws a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.it'] }),
      pattern(/ becomes an? /iu),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature with '),
      spanned(KEYWORD_WORDS),
      literal(' '),
      family<IrDuration>('duration'),
      pattern(/\. It['’]s still a land(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , pt, types, , keywords, , duration] = r.value;
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: IT_ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true,
      span: types.span,
      rule: IT_ID,
    };
    const clauses: IrClause[] = [
      {
        ...makeClause(IT_ID, 'becomes', { objects: subject, types: typeList, basePt }, types.span),
        duration,
        connector: 'and' as const,
      },
    ];
    keywords.value.forEach((name, i) => {
      const keyword = { kind: 'keywordName' as const, name, span: keywords.span, rule: IT_ID };
      clauses.push({
        ...makeClause(IT_ID, 'grantKeyword', { objects: subject, keyword }, keywords.span),
        duration,
        ...(i < keywords.value.length - 1 ? { connector: 'and' as const } : {}),
      });
    });
    return { ok: true, value: clauses, pos: r.pos };
  },
});

const ALL_TYPES_ID = 'effect.becomes-land-creature-all-types';

/**
 * `effect.becomes-land-creature-all-types`: "~ becomes a 2/2 creature with all creature types until end of turn. It's still a land." (CR 613.1d, 613.4b, 205.1b, 205.3m, 611.2a): a land that is
 * also a creature of every creature type until the end of the turn, with the base power and toughness the text says and its colors unchanged. Only `~` itself, only "until end of turn".
 * Not read: another duration, another subject, a color, a creature type of its own, a keyword, no base power and toughness, "that's still a land", the second sentence left out.
 */
export const EFFECT_BECOMES_LAND_CREATURE_ALL_TYPES = defineRule<Clauses>({
  id: ALL_TYPES_ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
    'CR 205.3m (Subtypes)',
  ],
  examples: [
    "~ becomes a 2/2 creature with all creature types until end of turn. It's still a land",
    '~ becomes a 2/2 creature with all creature types until end of turn. It’s still a land',
  ],
  rejects: [
    '~ becomes a 2/2 creature with all creature types until end of turn.',
    "~ becomes a 2/2 creature with all creature types until your next turn. It's still a land",
    "target land becomes a 2/2 creature with all creature types until end of turn. It's still a land",
    "~ becomes a creature with all creature types until end of turn. It's still a land",
    "~ becomes a 2/2 blue creature with all creature types until end of turn. It's still a land",
    "~ becomes a 2/2 creature with all creature types and flying until end of turn. It's still a land",
    "~ becomes a 2/2 creature until end of turn. It's still a land",
    "~ becomes a 2/2 creature with all creature types until end of turn. It's still a creature",
    "~ becomes a 2/2 creature with all creature types until end of turn. It's still a land and you draw a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      literal('creature with all creature types '),
      family<IrDuration>('duration'),
      pattern(/\. It['’]s still a land(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , pt, , duration] = r.value;
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: ALL_TYPES_ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: [],
      cardTypes: ['creature'],
      additive: true,
      allCreatureTypes: true,
      span: pt.span,
      rule: ALL_TYPES_ID,
    };
    const clause: IrClause = {
      ...makeClause(
        ALL_TYPES_ID,
        'becomes',
        { objects: subject, types: typeList, basePt },
        pt.span,
      ),
      duration,
    };
    return { ok: true, value: [clause], pos: r.pos };
  },
});

const SELF_KEYWORDS_ID = 'effect.becomes-land-creature-keywords-trailing';

/**
 * `effect.becomes-land-creature-keywords-trailing`: "~ becomes a 3/3 Citizen creature with vigilance until end of turn. It's still a land." (Mobilized District; CR 613.1d, 613.1f, 613.4b,
 * 205.1b, 611.2a): the land itself is also a creature until the end of the turn, with the base power and toughness, the creature types and the keywords the text says, its colors
 * unchanged (a land is colorless). "It's still a land" says its types are added to, not replaced. Only `~`, with no colors and the duration after the keywords. Not read: another
 * duration, another subject, a color (`effect.becomes-land-creature-trailing` and the lead rule read colors), no creature type, no keyword, "that's still a land", the second sentence
 * left out.
 */
export const EFFECT_BECOMES_LAND_CREATURE_KEYWORDS_TRAILING = defineRule<Clauses>({
  id: SELF_KEYWORDS_ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    "~ becomes a 3/3 Citizen creature with vigilance until end of turn. It's still a land",
    '~ becomes a 3/3 Citizen creature with vigilance until end of turn. It’s still a land',
    "~ becomes a 4/4 Elemental creature with trample and haste until end of turn. It's still a land",
  ],
  rejects: [
    '~ becomes a 3/3 Citizen creature with vigilance until end of turn.',
    "~ becomes a 3/3 Citizen creature with vigilance until your next turn. It's still a land",
    "target land becomes a 3/3 Citizen creature with vigilance until end of turn. It's still a land",
    "~ becomes a 3/3 green Citizen creature with vigilance until end of turn. It's still a land",
    "~ becomes a Citizen creature with vigilance until end of turn. It's still a land",
    "~ becomes a 3/3 creature with vigilance until end of turn. It's still a land",
    "~ becomes a 3/3 Citizen creature until end of turn. It's still a land",
    "~ becomes a 3/3 Citizen creature with vigilance until end of turn. It's still a land and you draw a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.self'] }),
      pattern(/ becomes an? /iu),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature with '),
      spanned(KEYWORD_WORDS),
      literal(' '),
      family<IrDuration>('duration'),
      pattern(/\. It['’]s still a land(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , pt, types, , keywords, , duration] = r.value;
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: SELF_KEYWORDS_ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true,
      span: types.span,
      rule: SELF_KEYWORDS_ID,
    };
    const clauses: IrClause[] = [
      {
        ...makeClause(
          SELF_KEYWORDS_ID,
          'becomes',
          { objects: subject, types: typeList, basePt },
          types.span,
        ),
        duration,
        connector: 'and' as const,
      },
    ];
    keywords.value.forEach((name, i) => {
      const keyword = {
        kind: 'keywordName' as const,
        name,
        span: keywords.span,
        rule: SELF_KEYWORDS_ID,
      };
      clauses.push({
        ...makeClause(
          SELF_KEYWORDS_ID,
          'grantKeyword',
          { objects: subject, keyword },
          keywords.span,
        ),
        duration,
        ...(i < keywords.value.length - 1 ? { connector: 'and' as const } : {}),
      });
    });
    return { ok: true, value: clauses, pos: r.pos };
  },
});

export const LAND_CREATURE_KEYWORDS_EFFECT_RULES = [
  EFFECT_LEAD_BECOMES_LAND_CREATURE_KEYWORDS,
  EFFECT_BECOMES_LAND_CREATURE_TRAILING,
  EFFECT_BECOMES_LAND_CREATURE_ALL_TYPES,
  EFFECT_BECOMES_LAND_CREATURE_KEYWORDS_TRAILING,
  EFFECT_IT_BECOMES_LAND_CREATURE_KEYWORDS,
];

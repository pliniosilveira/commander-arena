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

export const LAND_CREATURE_KEYWORDS_EFFECT_RULES = [EFFECT_LEAD_BECOMES_LAND_CREATURE_KEYWORDS];

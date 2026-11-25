/**
 * Effect rule of the Planeswalker Party deck (issue 132, Sparkshaper Visionary): the permanents a target slot named become creatures with keywords and an ability in quotes.
 */
import { fail, literal, optional, pattern, sequence } from '../../combinators';
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
import { readQuotedAbility } from '../static/quoted';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.lead-they-become-colored-creatures-ability';

/**
 * `effect.lead-they-become-colored-creatures-ability`: "Until end of turn, they become 3/3 blue Bird creatures with flying, hexproof, and "Whenever this creature deals combat damage to a
 * player, scry 1."" (Sparkshaper Visionary; CR 613.1d, 613.1e, 613.1f, 613.4b, 611.2a, 205.1a): the permanents the sentence before chose are, until the end of the turn, creatures of that color,
 * creature type and base power and toughness, no longer planeswalkers (the card types are replaced), with the keywords and the triggered or activated ability in the quotes. The engine's
 * `setTypes`, `setColors`, `setPt`, `grantKeyword` and `grantAbility` over the same targets. Not read: another duration, "it", "still a planeswalker", no color, no keyword, a quote that is
 * not an ability.
 */
export const EFFECT_LEAD_THEY_BECOME_COLORED_CREATURES_ABILITY = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1e (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1a (Type Line)',
  ],
  examples: [
    'until end of turn, they become 3/3 blue Bird creatures with flying, hexproof, and "Whenever ~ deals combat damage to a player, scry 1."',
    'Until end of turn, they become 2/2 red Goblin creatures with haste and "Whenever ~ deals combat damage to a player, scry 1."',
  ],
  rejects: [
    'until end of turn, they become 3/3 blue Bird creatures with flying, hexproof',
    'until your next turn, they become 3/3 blue Bird creatures with flying, hexproof, and "Whenever ~ deals combat damage to a player, scry 1."',
    'until end of turn, it becomes a 3/3 blue Bird creature with flying and "Whenever ~ deals combat damage to a player, scry 1."',
    'until end of turn, they become 3/3 Bird creatures with flying, hexproof, and "Whenever ~ deals combat damage to a player, scry 1."',
    'until end of turn, they become 3/3 blue Bird creatures with flying, hexproof, and "Flying."',
    'until end of turn, they become 3/3 blue Bird creatures with sparkle and "Whenever ~ deals combat damage to a player, scry 1."',
    'until end of turn, they become blue Bird creatures with flying, hexproof, and "Whenever ~ deals combat damage to a player, scry 1."',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', they become '),
      spanned(pattern(/(\d+)\/(\d+) /u)),
      spanned(pattern(/(white|blue|black|red|green)(?![\p{L}\p{N}]) /iu)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creatures with '),
      spanned(KEYWORD_WORDS),
      optional(literal(','), null),
      literal(' and '),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , pt, color, types, , keywords] = r.value;
    const quoted = readQuotedAbility(ctx, r.pos, { mana: false });
    if (!quoted.ok) return quoted;
    if (/^[\p{L}\p{N}]/u.test(ctx.text.slice(quoted.pos))) return fail(ctx, pos);
    const subject: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'them' },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: pos + 4 },
      rule: ID,
    };
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
      span: types.span,
      rule: ID,
    };
    const colorSpec: IrColorSpec = {
      kind: 'colorSpec',
      colors: [(color.value[1] ?? '').toLowerCase()],
      span: color.span,
      rule: ID,
    };
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
    for (const name of keywords.value) {
      const keyword = { kind: 'keywordName' as const, name, span: keywords.span, rule: ID };
      clauses.push({
        ...makeClause(ID, 'grantKeyword', { objects: subject, keyword }, keywords.span),
        duration,
        connector: 'and' as const,
      });
    }
    clauses.push({
      ...makeClause(
        ID,
        'grantAbility',
        { objects: subject, ability: quoted.value },
        quoted.value.span,
      ),
      duration,
    });
    return { ok: true, value: clauses, pos: quoted.pos };
  },
});

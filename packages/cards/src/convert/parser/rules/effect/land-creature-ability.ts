/**
 * Effect rule of the Goblin Storm deck (issue 144, Den of the Bugbear): a land that becomes a creature with a quoted ability until end of turn.
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
import { defineRule, family, spanned } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

const ABILITY_ID = 'effect.lead-becomes-land-creature-ability';

/**
 * `effect.lead-becomes-land-creature-ability`: "Until end of turn, ~ becomes a 3/2 red Goblin creature with \"Whenever ~ attacks, create a 1/1 red Goblin creature token that's tapped and
 * attacking.\" It's still a land." (issue 144, CR 613.1d, 613.1e, 613.1f, 613.4b, 205.1b, 611.2a): the land that is also a creature until the end of the turn of
 * `effect.lead-becomes-land-creature-keywords`, with a triggered or activated ability in quotes instead of keywords (the engine's `grantAbility` until end of turn). Only `~` itself.
 * Not read: another duration, another subject, no colors, no creature type, no ability in the quotes, "that's still a land", the second sentence left out.
 */
export const EFFECT_LEAD_BECOMES_LAND_CREATURE_ABILITY = defineRule<Clauses>({
  id: ABILITY_ID,
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
    'Until end of turn, ~ becomes a 3/2 red Goblin creature with "Whenever ~ attacks, create a 1/1 red Goblin creature token that\'s tapped and attacking." It\'s still a land',
    'Until end of turn, ~ becomes a 2/2 green and white Elf creature with "Whenever ~ attacks, you gain 1 life." It’s still a land',
  ],
  rejects: [
    'Until end of turn, ~ becomes a 3/2 red Goblin creature with "Whenever ~ attacks, you gain 1 life."',
    'Until end of turn, ~ becomes a 3/2 red Goblin creature with "Whenever ~ attacks, you gain 1 life." It\'s still a planeswalker',
    'Until your next turn, ~ becomes a 3/2 red Goblin creature with "Whenever ~ attacks, you gain 1 life." It\'s still a land',
    'Until end of turn, target land becomes a 3/2 red Goblin creature with "Whenever ~ attacks, you gain 1 life." It\'s still a land',
    'Until end of turn, ~ becomes a 3/2 Goblin creature with "Whenever ~ attacks, you gain 1 life." It\'s still a land',
    'Until end of turn, ~ becomes a 3/2 red creature with "Whenever ~ attacks, you gain 1 life." It\'s still a land',
    'Until end of turn, ~ becomes a 3/2 red Goblin creature with "Flying." It\'s still a land',
    'Until end of turn, ~ becomes a 3/2 red Goblin creature with "Whenever ~ attacks, you gain 1 life." It\'s still a land and you draw a card',
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
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , pt, colorWords, types] = r.value;
    const quoted = readQuotedAbility(ctx, r.pos, { mana: false });
    if (!quoted.ok) return quoted;
    const tail = pattern(/ It['’]s still a land(?![\p{L}\p{N}])/iu)(ctx, quoted.pos);
    if (!tail.ok) return tail;
    const colors = [colorWords.value[1], colorWords.value[2]]
      .filter((c): c is string => c !== undefined)
      .map((c) => c.toLowerCase());
    if (new Set(colors).size !== colors.length) return fail(ctx, pos);
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: ABILITY_ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true,
      span: types.span,
      rule: ABILITY_ID,
    };
    const colorSpec: IrColorSpec = {
      kind: 'colorSpec',
      colors,
      span: colorWords.span,
      rule: ABILITY_ID,
    };
    const becomes: IrClause = {
      ...makeClause(
        ABILITY_ID,
        'becomes',
        { objects: subject, types: typeList, colors: colorSpec, basePt },
        types.span,
      ),
      duration,
      connector: 'and' as const,
    };
    const grant: IrClause = {
      ...makeClause(
        ABILITY_ID,
        'grantAbility',
        { objects: subject, ability: quoted.value },
        quoted.value.span,
      ),
      duration,
    };
    return { ok: true, value: [becomes, grant], pos: tail.pos };
  },
});

export const LAND_CREATURE_ABILITY_EFFECT_RULES = [EFFECT_LEAD_BECOMES_LAND_CREATURE_ABILITY];

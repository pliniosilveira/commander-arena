/**
 * Effect rule of the manlands that gain a triggered ability (Raging Ravine): a land that becomes a creature until end of turn with an ability in quotes.
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

const ID = 'effect.lead-becomes-land-creature-trigger';

/**
 * `effect.lead-becomes-land-creature-trigger`: "Until end of turn, ~ becomes a 3/3 red and green Elemental creature with \"Whenever ~ attacks, put a +1/+1 counter on it.\" It's still a land."
 * (CR 611.2a, 613.1d, 613.1f, 613.4b, 205.1b, 603.1): a land that is also a creature until the end of the turn, with the base power and toughness, the colors and the creature types the
 * text says, and a triggered ability in quotes that it has until then (the engine's `grantAbility`). "It's still a land" says its types are added to, not replaced (CR 205.1b). Only `~` itself.
 * Not read: another duration, another subject, no colors, no creature type, an activated ability in the quotes, the second sentence left out, "that's still a land".
 */
export const EFFECT_LEAD_BECOMES_LAND_CREATURE_TRIGGER = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
    'CR 603.1 (Handling Triggered Abilities)',
  ],
  examples: [
    'Until end of turn, ~ becomes a 3/3 red and green Elemental creature with "Whenever ~ attacks, put a +1/+1 counter on it." It\'s still a land',
    'until end of turn, ~ becomes a 3/3 red and green Elemental creature with "Whenever ~ attacks, put a +1/+1 counter on it." It’s still a land',
  ],
  rejects: [
    'Until end of turn, ~ becomes a 3/3 red and green Elemental creature with "Whenever ~ attacks, put a +1/+1 counter on it."',
    'Until end of turn, ~ becomes a 3/3 red and green Elemental creature with "Whenever ~ attacks, put a +1/+1 counter on it." It\'s still a planeswalker',
    'Until your next turn, ~ becomes a 3/3 red and green Elemental creature with "Whenever ~ attacks, put a +1/+1 counter on it." It\'s still a land',
    'Until end of turn, target land becomes a 3/3 red and green Elemental creature with "Whenever ~ attacks, put a +1/+1 counter on it." It\'s still a land',
    'Until end of turn, ~ becomes a red and green Elemental creature with "Whenever ~ attacks, put a +1/+1 counter on it." It\'s still a land',
    'Until end of turn, ~ becomes a 3/3 Elemental creature with "Whenever ~ attacks, put a +1/+1 counter on it." It\'s still a land',
    'Until end of turn, ~ becomes a 3/3 red and green creature with "Whenever ~ attacks, put a +1/+1 counter on it." It\'s still a land',
    'Until end of turn, ~ becomes a 3/3 red and green Elemental creature with "{T}: Add {G}." It\'s still a land',
    'Until end of turn, ~ becomes a 3/3 red and green Elemental creature with "Whenever ~ attacks, put a +1/+1 counter on it." It\'s still a land and you draw a card',
  ],
  parse: (ctx, pos) => {
    const head = sequence(
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
    if (!head.ok) return head;
    const quoted = readQuotedAbility(ctx, head.pos, { mana: false });
    if (!quoted.ok) return quoted;
    if (quoted.value.ability.kind !== 'triggered') return fail(ctx, pos);
    const tail = pattern(/["”] It['’]s still a land(?![\p{L}\p{N}])/iu)(ctx, quoted.value.span.end);
    if (!tail.ok) return tail;
    const [duration, , subject, , pt, colorWords, types] = head.value;
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
      {
        ...makeClause(
          ID,
          'grantAbility',
          { objects: subject, ability: quoted.value },
          quoted.value.span,
        ),
        duration,
      },
    ];
    return { ok: true, value: clauses, pos: tail.pos };
  },
});

export const LAND_CREATURE_TRIGGER_EFFECT_RULES = [EFFECT_LEAD_BECOMES_LAND_CREATURE_TRIGGER];

/**
 * Condition of the Exit from Exile deck (Lovestruck Beast): "you control a 1/1 creature" (CR 603.4, 109.1, 208.1: a creature whose current power and toughness are these numbers).
 */
import { pattern } from '../../combinators';
import type { IrCondition, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';

const ID = 'condition.control-exact-pt-creature';

/**
 * `condition.control-exact-pt-creature`: "you control a 1/1 creature". One creature with exactly this power and exactly this toughness (the engine's `power` and `toughness` comparisons of
 * the filter, read as they are now), under the control of the player the condition is read for. Not read: "another", a plural, a power and toughness with a sign or an X, a creature type or
 * another card type, a third number.
 */
export const CONDITION_CONTROL_EXACT_PT_CREATURE = defineRule<IrCondition>({
  id: ID,
  family: 'condition',
  leading: ['you'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 208.1 (Power and Toughness)'],
  examples: ['you control a 1/1 creature', 'you control a 0/4 creature'],
  rejects: [
    'you control another 1/1 creature',
    'you control 1/1 creatures',
    'you control a +1/+1 creature',
    'you control a X/X creature',
    'you control a 1/1 Elf creature',
    'you control a 1/1/1 creature',
    'you control a 1/1 artifact',
    'you control a 1/1',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you control a (\d+)\/(\d+) creature(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: {
        types: ['creature'],
        power: { cmp: 'equal', value: Number(r.value[1]) },
        toughness: { cmp: 'equal', value: Number(r.value[2]) },
        raw: `${r.value[1]}/${r.value[2]} creature`,
      },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: ID,
    };
    return {
      ok: true,
      value: { kind: 'condition', test: { kind: 'control', noun }, span, rule: ID },
      pos: r.pos,
    };
  },
});

export const EXACT_PT_CONDITION_RULES = [CONDITION_CONTROL_EXACT_PT_CREATURE];

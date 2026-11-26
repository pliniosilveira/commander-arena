/**
 * The condition of group C of the Grand Larceny deck (issue 119): "the {1}{B} cost was paid" (Baleful Mastery; CR 118.9, 608.2c), read after the "if" of a sentence of a spell.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.alt-cost-paid`: "the {1}{B} cost was paid" (CR 118.9: an alternative cost is paid in place of the mana cost; CR 608.2c: the spell's text may check how it was cast). The cost
 * the words name is the alternative cost of mana the spell's own text gives (the engine's `castForAlternative`, which the face must list as `payMana`); the engine reads it from the spell, so
 * only a spell's own sentence is lowered. Plain mana only. Not read: "the alternative cost", "it was paid", a negation, "was not paid", a trailing word, a cost with a symbol that is not plain mana.
 */
export const CONDITION_ALT_COST_PAID = defineRule<IrCondition>({
  id: 'condition.alt-cost-paid',
  family: 'condition',
  leading: ['the'],
  cites: ['CR 118.9 (Costs)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['the {1}{B} cost was paid', 'the {U} cost was paid'],
  rejects: [
    'the {1}{B} cost was paid.',
    'the {1}{B} cost was not paid',
    'the {1}{B} was paid',
    'the {X}{B} cost was paid',
    'the {B/G} cost was paid',
    'the alternative cost was paid',
    'the cost was paid',
    'it was paid',
    'the {1}{B} cost was paid twice',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/the ((?:\{(?:[1-9]\d*|[WUBRGC])\})+) cost was paid(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const symbols = [...(r.value[1] ?? '').matchAll(/\{([^}]+)\}/gu)].map((m) => m[1] ?? '');
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'altCostPaid', cost: symbols },
        span,
        rule: 'condition.alt-cost-paid',
      },
      pos: r.pos,
    };
  },
});

export const GRAND_LARCENY_C_CONDITION_RULES = [CONDITION_ALT_COST_PAID];

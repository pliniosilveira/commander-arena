/**
 * The condition of a spell whose additional cost was paid (CR 118.8, 601.2b, 701.68a): "~'s additional cost was paid", read after the "if" of a sentence of a spell
 * ("Exile the top two cards of your library. If this spell's additional cost was paid, exile the top three cards instead."). The engine reads it from the spell
 * (`additionalCostPaid`); the only additional cost it tells apart is the optional blight of the face ("you may blight 1").
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.additional-cost-paid`: "~'s additional cost was paid" (the card's own name, or "this spell" before normalization). Not read: another object ("that spell's"),
 * "its additional cost was paid" (nothing says which object), a cost named by kind ("its kicker cost was paid"), the negative, or a plural ("additional costs").
 */
export const CONDITION_ADDITIONAL_COST_PAID = defineRule<IrCondition>({
  id: 'condition.additional-cost-paid',
  family: 'condition',
  leading: ["~'s", '~’s'],
  cites: ['CR 118.8 (Costs)', 'CR 601.2b (Casting Spells)', 'CR 701.68a (Blight)'],
  examples: ["~'s additional cost was paid", '~’s additional cost was paid'],
  rejects: [
    "~'s additional cost was not paid",
    "that spell's additional cost was paid",
    'its additional cost was paid',
    "~'s additional costs were paid",
    "~'s kicker cost was paid",
    "~'s additional cost was paid.",
    "~'s additional cost",
    '~ additional cost was paid',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/~['’]s additional cost was paid(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'additionalCostPaid' },
        span,
        rule: 'condition.additional-cost-paid',
      },
      pos: r.pos,
    };
  },
});

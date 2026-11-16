/**
 * `cost.behold`: "Behold a Jace" (CR 701.4, D-151), the additional cost of a spell. The player
 * reveals a matching card from their hand or chooses a matching permanent they control.
 */
import { fail, literal, sequence } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';

export const COST_BEHOLD = defineRule<IrCost>({
  id: 'cost.behold',
  family: 'cost',
  leading: ['behold'],
  cites: ['CR 701.4 (Behold)', 'CR 118.8 (Costs)'],
  examples: ['behold a Jace'],
  rejects: ['behold', 'behold a Jace or', 'behold another Jace', 'behold a Jace permanent'],
  parse: (ctx, pos) => {
    const r = sequence(literal('behold '), family<IrNoun>('noun'))(ctx, pos);
    if (!r.ok) return r;
    const what = r.value[1];
    if (what.det !== 'a' || what.other || what.upTo || what.filter.raw === '') {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: {
        kind: 'behold',
        what,
        span: { start: pos, end: r.pos },
        rule: 'cost.behold',
      },
      pos: r.pos,
    };
  },
});

/**
 * Lowerings of the Quandrix Unlimited deck, group G: "Distribute X +1/+1 counters among any number of target creatures you control" (CR 601.2d, 122.6).
 */
import type { Amount } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { lowerAmount } from './amounts';
import { arg, type Effects, failure, operand } from './clauses';
import { declareDividedTarget } from './nouns';
import type { Lowering } from './types';

/**
 * "Distribute X +1/+1 counters among any number of target creatures you control" (CR 601.2d, 122.6, 107.3a): the targets slot with `divide` (the total is the X the spell
 * announces, or a number, read as the spell is cast) and the engine's `distributeCounters` to it. A spell's own text only: the validation refuses a division of X in an ability.
 */
export const DISTRIBUTE_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'distributeCounters',
  id: 'lower.distribute-counters',
  needs: ['effect:distributeCounters', 'selector:target'],
  lower(clause, ctx) {
    const to = operand(clause, 'to');
    const counter = arg(clause, 'counter');
    const count = arg(clause, 'count');
    if (to?.kind !== 'noun' || to.det !== 'target' || counter?.kind !== 'counterSpec') {
      return failure(clause);
    }
    if (count === undefined || (count.kind !== 'number' && count.kind !== 'x')) {
      return failure(clause);
    }
    if (ctx.owner !== 'spell') return failure(clause);
    const amount = lowerAmount(count, ctx, clause.rule);
    if (!amount.ok) return amount;
    const total: Amount = amount.value;
    const id = declareDividedTarget(to, ctx, total);
    if (!id.ok) return id;
    return {
      ok: true,
      value: [
        { kind: 'distributeCounters', to: { kind: 'target', id: id.value }, counter: counter.name },
      ],
      rule: clause.rule,
    };
  },
};

export const QUANDRIX_G_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [DISTRIBUTE_COUNTERS];

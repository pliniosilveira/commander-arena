/**
 * "Adapt N" (CR 701.46a, Pteramander): "If this permanent has no +1/+1 counters on it, put N +1/+1 counters on it." The engine's `conditional` over `sourceHasCounter` (negated) with
 * `addCounters` on the permanent the ability is on.
 */

import type { IrClause } from '../ir/types';
import { amountArg, type Effects } from './clauses';
import type { Lowering } from './types';

const ADAPT: Lowering<IrClause, Effects> = {
  head: 'adapt',
  id: 'lower.adapt',
  needs: ['effect:conditional', 'effect:addCounters', 'condition:sourceHasCounter'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'conditional',
          condition: { kind: 'not', term: { kind: 'sourceHasCounter', counter: '+1/+1' } },
          effect: {
            kind: 'addCounters',
            objects: { kind: 'this' },
            counter: '+1/+1',
            count: count.value,
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const ADAPT_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [ADAPT];

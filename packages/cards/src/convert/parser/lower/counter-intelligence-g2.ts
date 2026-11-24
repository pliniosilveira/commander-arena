/**
 * Lowerings of the Counter Intelligence deck, group 2 (moving, removing, counting and choosing counters; CR 122.1, 603.10a, 113.7a).
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { objectRefOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Put those counters on target permanent you control." (Resourceful Defense, CR 603.10a, 122.1, 113.7a): in the body of a trigger about a permanent that left the battlefield with
 * counters on it, the counters it had as it last was, put on the target by the engine's `putCountersOf` of the triggering permanent. Anywhere else "those counters" names nothing
 * the engine could read, so it is refused.
 */
const PUT_THOSE_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'putThoseCounters',
  id: 'lower.put-those-counters',
  needs: ['effect:putCountersOf', 'selector:target'],
  lower(clause, ctx) {
    const to = arg(clause, 'to');
    if (to?.kind !== 'noun' || !ctx.hadCountersTrigger) return failure(clause);
    const target = objectRefOf(to, ctx);
    if (!target.ok) return target;
    if (target.value.kind !== 'target') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'putCountersOf', from: { kind: 'triggerSubject' }, to: target.value }],
      rule: clause.rule,
    };
  },
};

export const COUNTER_INTELLIGENCE_G2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PUT_THOSE_COUNTERS,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const COUNTER_INTELLIGENCE_G2_NEEDS: readonly FeatureRef[] = [
  'effect:putCountersOf',
  'selector:target',
];

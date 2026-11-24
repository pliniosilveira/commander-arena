/**
 * Lowerings of the Counter Intelligence deck, group 2 (moving, removing, counting and choosing counters; CR 122.1, 603.10a, 113.7a).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, eachObject, failure } from './clauses';
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

/** "a +1/+1 counter", "two charge counters": the words the player is shown for one of the choices. */
function counterWords(count: number, name: string): string {
  const words = ['zero', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  return `${words[count] ?? String(count)} ${name} counter${count === 1 ? '' : 's'}`;
}

/**
 * "Put your choice of a +1/+1 counter or two charge counters on up to one other target artifact." (Inspirit, Flagship Vessel; CR 122.6, 608.2d): the engine's `chooseOne` of two
 * `addCounters` of the same objects, chosen as the effect resolves.
 */
const PUT_CHOICE_OF_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'putChoiceOfCounters',
  id: 'lower.put-choice-of-counters',
  needs: ['effect:chooseOne', 'effect:addCounters'],
  lower(clause, ctx) {
    const first = arg(clause, 'counter');
    const second = arg(clause, 'counter2');
    if (first?.kind !== 'counterSpec' || second?.kind !== 'counterSpec') return failure(clause);
    const one = amountArg(clause, 'count', ctx);
    if (!one.ok) return one;
    const two = amountArg(clause, 'count2', ctx);
    if (!two.ok) return two;
    if (typeof one.value !== 'number' || typeof two.value !== 'number') return failure(clause);
    const counts = [one.value, two.value] as const;
    const names = [first.name, second.name] as const;
    return eachObject(clause, ctx, (objects): Effect => ({
      kind: 'chooseOne',
      options: [0, 1].map((i) => ({
        label: counterWords(counts[i] ?? 1, names[i] ?? ''),
        effect: {
          kind: 'addCounters',
          objects,
          counter: names[i] ?? '',
          count: counts[i] ?? 1,
        } as Effect,
      })),
    }));
  },
};

export const COUNTER_INTELLIGENCE_G2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PUT_THOSE_COUNTERS,
  PUT_CHOICE_OF_COUNTERS,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const COUNTER_INTELLIGENCE_G2_NEEDS: readonly FeatureRef[] = [
  'effect:putCountersOf',
  'selector:target',
  'effect:chooseOne',
  'effect:addCounters',
];

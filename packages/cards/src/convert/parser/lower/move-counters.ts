/**
 * Lowering of "Move any number of +1/+1 counters from ~ onto other creatures." (issue 230, CR 122.1): the engine's `moveCountersOnto`. The "you may" before it is the controller's
 * choice of none, which the engine asks as it runs (`acceptsOptional`); the permanent with the ability is the source, and only the effect of a triggered or activated ability has one.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

export const MOVE_COUNTERS_ONTO: Lowering<IrClause, Effects> = {
  head: 'moveCountersOnto',
  id: 'lower.move-counters-onto',
  needs: ['effect:moveCountersOnto'],
  acceptsOptional: true,
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    if (counter?.kind !== 'counterSpec' || ctx.owner === 'spell') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'moveCountersOnto',
          counter: counter.name,
          to: { zone: 'battlefield', types: ['creature'] },
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Move a counter from target permanent you control onto a second target permanent" (Nesting Grounds, CR 122.1, 608.2d): the engine's `moveCounter` between the two targets, the kind
 * left to the controller's choice when the source has several.
 */
export const MOVE_COUNTER_BETWEEN: Lowering<IrClause, Effects> = {
  head: 'moveCounterBetween',
  id: 'lower.move-counter-between',
  needs: ['effect:moveCounter'],
  lower(clause, ctx) {
    const from = arg(clause, 'from');
    const to = arg(clause, 'to');
    if (from?.kind !== 'noun' || to?.kind !== 'noun') return failure(clause);
    const source = objectSelectorOf(from, ctx);
    if (!source.ok) return source;
    const destination = objectSelectorOf(to, ctx);
    if (!destination.ok) return destination;
    if (source.value.kind !== 'target' || destination.value.kind !== 'target') {
      return failure(clause);
    }
    return {
      ok: true,
      value: [{ kind: 'moveCounter', from: source.value, to: destination.value }],
      rule: clause.rule,
    };
  },
};

export const MOVE_COUNTERS_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  MOVE_COUNTERS_ONTO,
  MOVE_COUNTER_BETWEEN,
];

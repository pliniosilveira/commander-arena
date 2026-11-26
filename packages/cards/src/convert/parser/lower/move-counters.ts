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
 * "Move any number of +1/+1 counters from other permanents you control onto ~." (Aetherborn Marauder, CR 122.5, 608.2d): the engine's `moveCounter` onto the permanent with the ability,
 * from any of the permanents the noun names, of one kind, as many as the controller likes. Only an ability of a permanent has a permanent to move them onto.
 */
export const MOVE_COUNTERS_FROM_OTHERS: Lowering<IrClause, Effects> = {
  head: 'moveCountersFromOthers',
  id: 'lower.move-counters-from-others',
  needs: ['effect:moveCounter'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    const from = arg(clause, 'from');
    if (counter?.kind !== 'counterSpec' || from?.kind !== 'noun' || ctx.owner === 'spell') {
      return failure(clause);
    }
    const objects = objectSelectorOf(from, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'each') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'moveCounter',
          from: objects.value,
          to: { kind: 'this' },
          anyNumber: true,
          counter: counter.name,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const MOVE_COUNTERS_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  MOVE_COUNTERS_ONTO,
  MOVE_COUNTERS_FROM_OTHERS,
];

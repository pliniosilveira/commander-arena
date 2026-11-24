/**
 * Lowerings of the effects whose controller chooses which counters (CR 122.1, 122.5, 608.2d): the engine's `removeChosenCounters` ("Remove any number of counters from among permanents on
 * the battlefield", "Remove up to three counters from target permanent") and `moveCounter` ("Move a counter from target permanent you control onto a second target permanent").
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure } from './clauses';
import { objectRefOf } from './nouns';
import type { Lowering } from './types';

const REMOVE_CHOSEN_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'removeChosenCounters',
  id: 'lower.remove-chosen-counters',
  needs: ['effect:removeChosenCounters'],
  lower(clause, ctx) {
    const upTo = arg(clause, 'upTo');
    // No `upTo` is "any number"; one that is not a whole number written out is not read.
    if (upTo !== undefined && (upTo.kind !== 'number' || upTo.value < 1)) return failure(clause);
    return eachObject(clause, ctx, (objects) => ({
      kind: 'removeChosenCounters',
      objects,
      ...(upTo === undefined || upTo.kind !== 'number' ? {} : { upTo: upTo.value }),
    }));
  },
};

const MOVE_COUNTER: Lowering<IrClause, Effects> = {
  head: 'moveCounter',
  id: 'lower.move-counter',
  needs: ['effect:moveCounter', 'selector:target'],
  lower(clause, ctx) {
    const from = arg(clause, 'from');
    const to = arg(clause, 'to');
    if (from?.kind !== 'noun' || to?.kind !== 'noun') return failure(clause);
    const source = objectRefOf(from, ctx);
    if (!source.ok) return source;
    const destination = objectRefOf(to, ctx);
    if (!destination.ok) return destination;
    if (source.value.kind !== 'target' || destination.value.kind !== 'target') {
      return failure(clause);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'moveCounter',
          from: source.value,
          to: destination.value,
          // "Move any number of counters" (Resourceful Defense, CR 122.5, 608.2d).
          ...(arg(clause, 'anyNumber') === undefined ? {} : { anyNumber: true as const }),
        },
      ],
      rule: clause.rule,
    };
  },
};

export const COUNTER_CHOICE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REMOVE_CHOSEN_COUNTERS,
  MOVE_COUNTER,
];

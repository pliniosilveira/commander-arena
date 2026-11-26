/**
 * Lowering of "Counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card without paying its mana cost
 * for as long as it remains exiled." Same contract as effects.ts: each lowering declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { type Effects, eachObject, failure } from './clauses';
import type { Lowering } from './types';

/**
 * (CR 701.6a, 614.1a, 118.9, 611.2b, 406.3): the engine's `counter` with `exileInstead`, then the `mayPlay` of the card it exiled (`moved`, which is empty when the spell was not
 * countered), cast only, for no mana cost, for as long as the card remains in exile.
 */
export const COUNTER_EXILE_CAST_WHILE_EXILED: Lowering<IrClause, Effects> = {
  head: 'counterExileCastWhileExiled',
  id: 'lower.counter-exile-cast-while-exiled',
  needs: ['effect:counter', 'effect:mayPlay'],
  lower(clause, ctx) {
    const countered = eachObject(clause, ctx, (objects) => ({
      kind: 'counter',
      objects,
      exileInstead: true,
    }));
    if (!countered.ok) return countered;
    if (countered.value.length !== 1) return failure(clause);
    return {
      ok: true,
      value: [
        ...countered.value,
        {
          kind: 'mayPlay',
          objects: { kind: 'moved' },
          free: true,
          castOnly: true,
          lasts: 'whileExiled',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const COUNTER_EXILE_CAST_WHILE_EXILED_LOWERINGS = [COUNTER_EXILE_CAST_WHILE_EXILED];

/**
 * Clause lowerings of the Jeskai free-cast cards (deck support issue 100). Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { type Effects, eachObject, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "Counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost."
 * (CR 701.6a, 614.1a, 608.2g): the engine's `counter` with `exileInstead`, then the `castFree` of the card it exiled (`moved`, which is empty when the spell was not countered).
 */
export const COUNTER_EXILE_CAST: Lowering<IrClause, Effects> = {
  head: 'counterExileCast',
  id: 'lower.counter-exile-cast',
  needs: ['effect:counter', 'effect:castFree'],
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
      value: [...countered.value, { kind: 'castFree', objects: { kind: 'moved' } }],
      rule: clause.rule,
    };
  },
};

export const JESKAI_CASTFREE_LOWERINGS = [COUNTER_EXILE_CAST];

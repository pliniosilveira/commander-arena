/**
 * Lowering of "Exile up to one target nonland permanent. For as long as that card remains exiled, its owner may cast it." (Aerial Extortionist, issue 128; CR 701.13, 406.3, 108.3, 611.2b):
 * the engine's `exile` of what the operand names, then the `mayPlay` of the card it exiled (`moved`, empty when nothing was exiled), cast only, held by the owner, until it leaves exile.
 */
import type { IrClause } from '../ir/types';
import { type Effects, eachObject, failure } from './clauses';
import type { Lowering } from './types';

export const EXILE_OWNER_MAY_CAST: Lowering<IrClause, Effects> = {
  head: 'exileOwnerMayCast',
  id: 'lower.exile-owner-may-cast',
  needs: ['effect:exile', 'effect:mayPlay'],
  lower(clause, ctx) {
    const exiled = eachObject(clause, ctx, (objects) => ({ kind: 'exile', objects }));
    if (!exiled.ok) return exiled;
    if (exiled.value.length !== 1) return failure(clause);
    return {
      ok: true,
      value: [
        ...exiled.value,
        {
          kind: 'mayPlay',
          objects: { kind: 'moved' },
          castOnly: true,
          lasts: 'whileExiled',
          byOwner: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const EXILE_OWNER_CAST_LOWERINGS = [EXILE_OWNER_MAY_CAST];

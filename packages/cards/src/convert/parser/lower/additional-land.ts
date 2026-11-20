/**
 * Lowering of "You may play an additional land this turn." (issue 208, CR 305.2): the engine's `additionalLandDropThisTurn`. With an `amount` ("You may play X additional lands
 * this turn", CR 107.3a) the number is that amount, read as the effect runs.
 */
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects } from './clauses';
import type { Lowering } from './types';

export const ADDITIONAL_LAND_DROP: Lowering<IrClause, Effects> = {
  head: 'additionalLandDrop',
  id: 'lower.additional-land-drop',
  needs: ['effect:additionalLandDropThisTurn'],
  lower(clause, ctx) {
    if (arg(clause, 'count') === undefined) {
      return {
        ok: true,
        value: [{ kind: 'additionalLandDropThisTurn', count: 1 }],
        rule: clause.rule,
      };
    }
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [{ kind: 'additionalLandDropThisTurn', count: count.value }],
      rule: clause.rule,
    };
  },
};

export const ADDITIONAL_LAND_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  ADDITIONAL_LAND_DROP,
];

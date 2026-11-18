/**
 * Lowering of "You may play an additional land this turn." (issue 208, CR 305.2): the engine's `additionalLandDropThisTurn`.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

export const ADDITIONAL_LAND_DROP: Lowering<IrClause, Effects> = {
  head: 'additionalLandDrop',
  id: 'lower.additional-land-drop',
  needs: ['effect:additionalLandDropThisTurn'],
  lower(clause) {
    return {
      ok: true,
      value: [{ kind: 'additionalLandDropThisTurn', count: 1 }],
      rule: clause.rule,
    };
  },
};

export const ADDITIONAL_LAND_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  ADDITIONAL_LAND_DROP,
];

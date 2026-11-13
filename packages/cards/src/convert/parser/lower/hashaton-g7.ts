/**
 * Lowering of group 7 of the Hashaton deck (issue 31, D-1130 to D-1139): "there is an additional beginning phase after this phase".
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

/** "There is an additional beginning phase after this phase" (CR 500.8): the engine's `extraBeginningPhase`, in an ability of the postcombat main phase only (`validateCard`). */
export const EXTRA_BEGINNING_PHASE: Lowering<IrClause, Effects> = {
  head: 'extraBeginningPhase',
  id: 'lower.extra-beginning-phase',
  needs: ['effect:extraBeginningPhase'],
  lower: (clause) => ({ ok: true, value: [{ kind: 'extraBeginningPhase' }], rule: clause.rule }),
};

export const HASHATON_G7_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXTRA_BEGINNING_PHASE,
];

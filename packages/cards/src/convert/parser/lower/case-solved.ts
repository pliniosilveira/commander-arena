/**
 * Lowering of the Case cards' "To solve" effect (CR 719.3a): the instruction the grammar reads for it.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

/** "~ becomes solved" (CR 719.3a, 719.3b): the engine's `solve`, the effect of the trigger "To solve" stands for. */
const BECOME_SOLVED: Lowering<IrClause, Effects> = {
  head: 'becomeSolved',
  id: 'lower.become-solved',
  needs: ['effect:solve'],
  lower: (clause) => ({ ok: true, value: [{ kind: 'solve' }], rule: clause.rule }),
};

export const CASE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [BECOME_SOLVED];

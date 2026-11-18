/**
 * Lowering of "Populate" (issue 160, D-611, CR 701.36): the engine's `populate`.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

export const POPULATE: Lowering<IrClause, Effects> = {
  head: 'populate',
  id: 'lower.populate',
  needs: ['effect:populate'],
  lower(clause) {
    return { ok: true, value: [{ kind: 'populate' }], rule: clause.rule };
  },
};

export const POPULATE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [POPULATE];

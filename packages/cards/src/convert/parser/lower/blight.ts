/**
 * Lowering of "Blight N" as an instruction (CR 701.68a): the engine's `blight`, always the controller's.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import { arg } from './clauses';
import type { Lowering } from './types';

export const BLIGHT: Lowering<IrClause, Effects> = {
  head: 'blight',
  id: 'lower.blight',
  needs: ['effect:blight'],
  lower(clause) {
    const count = arg(clause, 'count');
    if (count?.kind !== 'number' || !Number.isInteger(count.value) || count.value < 1) {
      return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    }
    return { ok: true, value: [{ kind: 'blight', count: count.value }], rule: clause.rule };
  },
};

export const BLIGHT_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [BLIGHT];

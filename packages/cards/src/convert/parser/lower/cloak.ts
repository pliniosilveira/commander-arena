/**
 * Lowering of "Cloak the top card of your library." (CR 701.58a): the engine's `manifest` with `cloak`, a face-down 2/2 creature with ward {2}.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

export const CLOAK: Lowering<IrClause, Effects> = {
  head: 'cloak',
  id: 'lower.cloak',
  needs: ['effect:manifest'],
  lower(clause) {
    return {
      ok: true,
      value: [{ kind: 'manifest', player: { kind: 'you' }, cloak: true }],
      rule: clause.rule,
    };
  },
};

export const CLOAK_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [CLOAK];

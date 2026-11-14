/**
 * Lowering of group 2 of the Feather deck (issue 27, D-1312): "Monstrosity 5" (CR 701.37a), the engine's `monstrosity` on the permanent the ability belongs to. The second damage
 * of "~ deals 4 damage to X and 2 damage to Y" is the ordinary `lower.damage` (the clause only has no subject of its own).
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

const MONSTROSITY: Lowering<IrClause, Effects> = {
  head: 'monstrosity',
  id: 'lower.monstrosity',
  needs: ['effect:monstrosity'],
  lower(clause) {
    const count = arg(clause, 'count');
    if (count?.kind !== 'number') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'monstrosity', count: count.value }],
      rule: clause.rule,
    };
  },
};

export const FEATHER_G2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [MONSTROSITY];

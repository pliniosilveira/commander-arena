/**
 * Lowering of group 2 of the Feather deck (issue 27, D-445): "Monstrosity 5" (CR 701.37a), the engine's `monstrosity` on the permanent the ability belongs to. The second damage
 * of "~ deals 4 damage to X and 2 damage to Y" is the ordinary `lower.damage` (the clause only has no subject of its own).
 */
import type { IrClause } from '../ir/types';
import { amountArg, type Effects } from './clauses';
import type { Lowering } from './types';

const MONSTROSITY: Lowering<IrClause, Effects> = {
  head: 'monstrosity',
  id: 'lower.monstrosity',
  needs: ['effect:monstrosity'],
  lower(clause, ctx) {
    // "Monstrosity X, where X is ...": the amount the sentence defines, read once as the effect resolves (CR 701.37a).
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return { ok: true, value: [{ kind: 'monstrosity', count: count.value }], rule: clause.rule };
  },
};

export const FEATHER_G2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [MONSTROSITY];

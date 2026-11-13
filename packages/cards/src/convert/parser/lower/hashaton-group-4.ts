/**
 * Lowering of group 4 of the Hashaton deck (issue 31, D-1120): "amass Zombies 1" (CR 701.47a).
 */
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "Amass Zombies 1" (CR 701.47a): the engine's `amass` with the creature type the words name and N, a number or X (an amount read as the effect resolves).
 */
export const AMASS: Lowering<IrClause, Effects> = {
  head: 'amass',
  id: 'lower.amass',
  needs: ['effect:amass'],
  lower(clause, ctx) {
    const types = arg(clause, 'types');
    const [subtype, ...more] = types?.kind === 'typeList' ? types.subtypes : [];
    if (subtype === undefined || more.length > 0) return failure(clause);
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [{ kind: 'amass', subtype, count: count.value }],
      rule: clause.rule,
    };
  },
};

export const HASHATON_GROUP_4_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [AMASS];

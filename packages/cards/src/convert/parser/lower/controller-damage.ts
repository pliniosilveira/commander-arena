/**
 * Lowering of issue 279 (Rakdos Charm): "each creature deals 1 damage to its controller", the engine's `dealDamageToController` of the group.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { lowerAmount } from './amounts';
import { arg, type Effects, failure } from './clauses';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

/** "Each creature deals 1 damage to its controller." (CR 120.3, 109.4, 608.2h): the group is an `each` selector of permanents on the battlefield; the number is a whole number. */
const DEAL_DAMAGE_TO_CONTROLLER: Lowering<IrClause, Effects> = {
  head: 'dealDamageToController',
  id: 'lower.deal-damage-to-controller',
  needs: ['effect:dealDamageToController', 'selector:each'],
  lower(clause, ctx) {
    const named = arg(clause, 'objects');
    const count = arg(clause, 'amount');
    if (named?.kind !== 'noun' || named.det !== 'each' || count?.kind !== 'number') {
      return failure(clause);
    }
    const objects = objectSelectorOf(named, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'each') return failure(clause);
    const amount = lowerAmount(count, ctx, clause.rule);
    if (!amount.ok) return amount;
    const effect: Effect = {
      kind: 'dealDamageToController',
      objects: objects.value,
      amount: amount.value,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const CONTROLLER_DAMAGE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DEAL_DAMAGE_TO_CONTROLLER,
];

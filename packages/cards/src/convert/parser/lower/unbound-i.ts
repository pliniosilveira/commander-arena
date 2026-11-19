/**
 * Lowering of group I of the Quandrix Unlimited deck (Unbound Flourishing): "double the value of X" (CR 107.3), the engine's `doubleSpellX` of the spell whose casting caused the
 * trigger. It is read only in an ability that triggers when a spell with {X} in its mana cost is cast: anywhere else there is no X of a spell to double.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import type { Lowering } from './types';

const DOUBLE_X: Lowering<IrClause, Effects> = {
  head: 'doubleSpellX',
  id: 'lower.doubleSpellX',
  needs: ['effect:doubleSpellX'],
  lower(clause, ctx) {
    const noun = arg(clause, 'spell');
    if (noun?.kind !== 'noun' || noun.det !== 'triggerSubject' || !ctx.castTriggerX) {
      return failure(clause);
    }
    const missing = missingFeatures(['selector:triggerSubject']);
    if (missing.length > 0) return failure(clause, missing);
    return {
      ok: true,
      value: [{ kind: 'doubleSpellX', spell: { kind: 'triggerSubject' } }],
      rule: clause.rule,
    };
  },
};

export const UNBOUND_I_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [DOUBLE_X];

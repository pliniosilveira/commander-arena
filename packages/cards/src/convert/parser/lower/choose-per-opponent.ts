/**
 * Lowering of the Limit Break deck's "For each opponent, choose an artifact or land that player controls. Destroy the chosen permanents." (Ultimate Magic: Meteor; CR 608.2d, 701.8):
 * the engine's `chooseOnePerOpponentDestroy`. Same contract as effects.ts: it declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const CHOOSE_ONE_PER_OPPONENT_DESTROY: Lowering<IrClause, Effects> = {
  head: 'chooseOnePerOpponentDestroy',
  id: 'lower.choose-one-per-opponent-destroy',
  needs: ['effect:chooseOnePerOpponentDestroy'],
  lower(clause) {
    const what = arg(clause, 'what');
    if (what === undefined || what.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [{ kind: 'chooseOnePerOpponentDestroy', filter: filter.value }],
      rule: clause.rule,
    };
  },
};

export const CHOOSE_PER_OPPONENT_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CHOOSE_ONE_PER_OPPONENT_DESTROY,
];

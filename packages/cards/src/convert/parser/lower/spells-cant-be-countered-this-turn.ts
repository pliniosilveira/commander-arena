/** Lowering of "Creature spells you cast this turn can't be countered." (Domri, CR 101.2, 611.2a): the engine's `spellsCantBeCounteredThisTurn`. */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

export const SPELLS_CANT_BE_COUNTERED_THIS_TURN: Lowering<IrClause, Effects> = {
  head: 'spellsCantBeCounteredThisTurn',
  id: 'lower.spells-cant-be-countered-this-turn',
  needs: ['effect:spellsCantBeCounteredThisTurn'],
  lower(clause) {
    const spells = arg(clause, 'spells');
    if (spells?.kind !== 'noun') return failure(clause);
    const missing = missingFeatures(['effect:spellsCantBeCounteredThisTurn']);
    if (missing.length > 0) return failure(clause, missing);
    const filter = lowerFilter(spells);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [{ kind: 'spellsCantBeCounteredThisTurn', spells: filter.value }],
      rule: clause.rule,
    };
  },
};

export const SPELLS_CANT_BE_COUNTERED_THIS_TURN_LOWERINGS: readonly Lowering<IrClause, Effects>[] =
  [SPELLS_CANT_BE_COUNTERED_THIS_TURN];

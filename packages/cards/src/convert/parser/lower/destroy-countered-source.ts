/**
 * Lowering of "If a permanent's ability is countered this way, destroy that permanent." (Green Slime, CR 701.6a, 701.8): a `destroy` of `moved`, the permanents that were the sources of
 * the abilities the counter before it countered. Refused unless the effect before it in the sequence is a `counter` of an ability.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

export const DESTROY_COUNTERED_ABILITY_SOURCE: Lowering<IrClause, Effects> = {
  head: 'destroyCounteredAbilitySource',
  id: 'lower.destroy-countered-ability-source',
  needs: ['effect:counter', 'effect:destroy'],
  lower: (clause) => ({
    ok: true,
    value: [{ kind: 'destroy', objects: { kind: 'moved' } }],
    rule: clause.rule,
  }),
};

export const DESTROY_COUNTERED_SOURCE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DESTROY_COUNTERED_ABILITY_SOURCE,
];

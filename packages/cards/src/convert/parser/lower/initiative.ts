/**
 * "You take the initiative." (CR 726.1, 726.5): the engine's `takeInitiative` of the controller. The inherent abilities of the initiative (CR 726.2) are the engine's.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

export const TAKE_INITIATIVE: Lowering<IrClause, Effects> = {
  head: 'takeInitiative',
  id: 'lower.take-initiative',
  needs: ['effect:takeInitiative'],
  lower(clause) {
    return {
      ok: true,
      value: [{ kind: 'takeInitiative', player: { kind: 'you' } }],
      rule: clause.rule,
    };
  },
};

/** Features the lowerings of this file can name, for the dimension test. */
export const INITIATIVE_NEEDS: readonly FeatureRef[] = ['effect:takeInitiative'];

export const INITIATIVE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [TAKE_INITIATIVE];

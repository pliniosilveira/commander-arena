/**
 * Lowerings of Finale of Revelation (issue 337): "you have no maximum hand size for the rest of the game".
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

/** "You have no maximum hand size for the rest of the game" (CR 402.2, 514.1): the engine's `noMaxHandSizeForGame` of the controller. */
const NO_MAX_HAND_SIZE_GAME: Lowering<IrClause, Effects> = {
  head: 'noMaxHandSizeForGame',
  id: 'lower.no-max-hand-size-game',
  needs: ['effect:noMaxHandSizeForGame'],
  lower(clause) {
    if (Object.keys(clause.args).length > 0) return failure(clause);
    return { ok: true, value: [{ kind: 'noMaxHandSizeForGame' }], rule: clause.rule };
  },
};

/** Features the lowerings of this file can name, for the dimension test. */
export const FINALE_NEEDS: readonly FeatureRef[] = ['effect:noMaxHandSizeForGame'];

export const FINALE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [NO_MAX_HAND_SIZE_GAME];

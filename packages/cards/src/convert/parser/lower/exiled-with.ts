/**
 * Lowerings of Valakut Exploration (the Tannuk landfall group): "put them into their owner's graveyard" after the intervening "if there are
 * cards exiled with ~". "Them" are the cards that condition counted, which the engine names `linkedExile`, and "that much" is how many of them were put there (`movedCount`).
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

/** "Put them into their owner's graveyard" (CR 607.2a, 400.3): the cards the permanent exiled with its linked ability, still in exile, go to their owners' graveyards. */
const PUT_EXILED_WITH_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'putExiledWithGraveyard',
  id: 'lower.put-exiled-with-graveyard',
  needs: ['effect:moveToZone'],
  lower(clause, ctx) {
    // "Them" has an antecedent only in "if there are cards exiled with ~", the intervening "if" of the same ability.
    if (!ctx.exiledWithCondition) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'moveToZone', objects: { kind: 'linkedExile' }, to: 'graveyard' }],
      rule: clause.rule,
    };
  },
};

export const EXILED_WITH_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PUT_EXILED_WITH_GRAVEYARD,
];

/** The features the lowerings of this file name, for the dimension test. */
export const EXILED_WITH_NEEDS: readonly FeatureRef[] = [
  'effect:moveToZone',
  'condition:amountIs',
  'amount:countOf',
  'selector:exiledWithSource',
];

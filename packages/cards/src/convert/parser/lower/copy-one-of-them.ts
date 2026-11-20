/**
 * Lowering of "Create a token that's a copy of one of them." (Twilight Diviner, CR 603.2c, 608.2d, 707.2): the engine's `copyOneOfTriggerCards`, which asks the controller to choose one of the
 * permanents that triggered the ability (a batch `entersBatch` trigger) and creates a token with its copiable values.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

export const COPY_ONE_OF_THEM: Lowering<IrClause, Effects> = {
  head: 'copyOneOfThem',
  id: 'lower.copy-one-of-them',
  needs: ['effect:copyOneOfTriggerCards'],
  lower(clause, ctx) {
    // "Them" are the permanents of a batch of enters: no other trigger has a group to choose from.
    if (!ctx.entersBatchTrigger || clause.optional) return failure(clause);
    return { ok: true, value: [{ kind: 'copyOneOfTriggerCards' }], rule: clause.rule };
  },
};

export const COPY_ONE_OF_THEM_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  COPY_ONE_OF_THEM,
];

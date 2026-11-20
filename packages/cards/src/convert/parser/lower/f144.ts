/**
 * Clause lowerings of deck support issue 144. Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "If any of those cards remain exiled, put them into your graveyard." (Glimpse the Impossible; CR 400.7, 404.1, 608.2c): the engine's `moveToZone` of the cards the `exileTop` before it
 * exiled (`moved`) to the graveyard. In a delayed ability the engine binds them as the ability is created, and finds only those still in exile when it triggers. Only after such an exile.
 */
export const PUT_EXILED_INTO_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'putExiledIntoGraveyard',
  id: 'lower.put-exiled-into-graveyard',
  needs: ['effect:moveToZone', 'effect:exileTop'],
  lower(clause, ctx) {
    if (ctx.exiled !== 'top') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'moveToZone', objects: { kind: 'moved' }, to: 'graveyard' }],
      rule: clause.rule,
    };
  },
};

export const F144_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [PUT_EXILED_INTO_GRAVEYARD];

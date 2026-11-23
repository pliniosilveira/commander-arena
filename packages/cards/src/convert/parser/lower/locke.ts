/**
 * Lowering of "Until end of turn, you may cast a spell from among those cards." (Locke, Treasure Hunter, issue 97; CR 601.2, 611.2a): the engine's `mayCastOneMilled`.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * `mayCastOneMilled`: one spell from among the cards a mill of the text milled, until end of turn. Only after a mill by the controller or by each player (`ctx.milledBefore`):
 * after anything else "those cards" has nothing to mean here and the clause is not lowered. The duration is the sentence's, and only "until end of turn" is read.
 */
export const MAY_CAST_ONE_MILLED: Lowering<IrClause, Effects> = {
  head: 'mayCastOneMilled',
  id: 'lower.may-cast-one-milled',
  needs: ['effect:mayCastOneMilled', 'duration:untilEndOfTurn'],
  takesDuration: true,
  acceptsOptional: true,
  lower(clause, ctx) {
    if (!ctx.milledBefore || clause.duration?.scope !== 'untilEndOfTurn') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'mayCastOneMilled', duration: 'untilEndOfTurn' }],
      rule: clause.rule,
    };
  },
};

export const LOCKE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [MAY_CAST_ONE_MILLED];

/** The features the lowering of this file names, for the dimension test. */
export const LOCKE_NEEDS = ['effect:mayCastOneMilled', 'duration:untilEndOfTurn'] as const;

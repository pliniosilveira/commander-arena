/**
 * Lowering of the meld ability (D-278, CR 701.42a, 712.4a): the condition "you both own and control ~ and a creature named X" and the effect "exile them, then meld them
 * into Y". The effect names no counterpart of its own ("them" are the card and the creature of the condition), so the condition leaves the name in the lowering context
 * and the effect reads it from there; an effect with no such condition before it is not read.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

/**
 * `meld`: the engine's `meld { partner, result }`. A meld instruction that carries a "you may", a condition or a duration is not lowered (the generic gate of
 * `lowerClause`), and one with no counterpart named by an intervening "if" of the same ability before it is refused.
 */
export const MELD: Lowering<IrClause, Effects> = {
  head: 'meld',
  id: 'lower.meld',
  needs: ['effect:meld'],
  lower: (clause, ctx) => {
    const result = arg(clause, 'result');
    if (result?.kind !== 'name' || ctx.meldPartner === null) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'meld', partner: ctx.meldPartner, result: result.name }],
      rule: clause.rule,
    };
  },
};

export const MELD_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [MELD];

/** The features the lowerings of this file and its condition name, for the dimension test. */
export const MELD_NEEDS: readonly FeatureRef[] = ['effect:meld', 'condition:ownsAndControlsNamed'];

/**
 * "Change the target of target spell or ability with a single target." (CR 115.7a, 115.9a; stage P38, D-182): the engine's `changeTarget`. The spell or
 * ability is a declared target of the stack (the effect finds it as it resolves, and does nothing when it has left the stack or no longer has the
 * single target, CR 608.2b); its slot says "with a single target" (`ObjectFilter.singleTarget`), which `validateCard` wants.
 */

import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { objectRefOf } from './nouns';
import type { Lowering } from './types';

export const CHANGE_TARGET: Lowering<IrClause, Effects> = {
  head: 'changeTarget',
  id: 'lower.changeTarget',
  needs: ['effect:changeTarget'],
  lower(clause, ctx) {
    const noun = arg(clause, 'object');
    if (noun?.kind !== 'noun') return failure(clause);
    const ref = objectRefOf(noun, ctx);
    if (!ref.ok) return ref;
    if (ref.value.kind !== 'target') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'changeTarget', object: ref.value }],
      rule: clause.rule,
    };
  },
};

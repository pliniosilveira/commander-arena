/**
 * "Copy target instant or sorcery spell. You may choose new targets for the copy." and "Whenever you cast a spell
 * of the chosen type, copy that spell." (CR 707.10, 707.10c; stage P27, D-129): the engine's `copySpell`. The spell
 * is a declared target of the stack (the effect finds it as it resolves) or the spell of the cast trigger
 * (`triggerSubject`, read from last-known information when it has left the stack, CR 113.7a). "You may choose new
 * targets for the copy" is `newTargets: 'may'`, its absence `'no'`. Which spells can be copied from where is
 * `validateCard`'s refusal (a trigger that is not about a cast, a target slot the ability does not declare).
 */
import type { Amount, ObjectRef } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { objectRefOf } from './nouns';
import type { Lowering } from './types';

export const COPY_SPELL: Lowering<IrClause, Effects> = {
  head: 'copySpell',
  id: 'lower.copySpell',
  needs: ['effect:copySpell'],
  lower(clause, ctx) {
    const noun = arg(clause, 'spell');
    const flag = arg(clause, 'newTargets');
    if (noun?.kind !== 'noun' || flag?.kind !== 'flag') return failure(clause);
    let spell: ObjectRef;
    if (noun.det === 'triggerSubject') {
      const missing = missingFeatures(['selector:triggerSubject']);
      if (missing.length > 0) return failure(clause, missing);
      spell = { kind: 'triggerSubject' };
    } else {
      const ref = objectRefOf(noun, ctx);
      if (!ref.ok) return ref;
      if (ref.value.kind !== 'target') return failure(clause);
      spell = ref.value;
    }
    // "copy it for each time you've cast your commander from the command zone this game" (D-971, CR 707.10, 903.8): the number of copies.
    let count: Amount | undefined;
    if (arg(clause, 'count') !== undefined) {
      const lowered = amountArg(clause, 'count', ctx);
      if (!lowered.ok) return lowered;
      count = lowered.value;
    }
    return {
      ok: true,
      value: [
        {
          kind: 'copySpell',
          spell,
          newTargets: flag.value ? 'may' : 'no',
          ...(count === undefined ? {} : { count }),
        },
      ],
      rule: clause.rule,
    };
  },
};

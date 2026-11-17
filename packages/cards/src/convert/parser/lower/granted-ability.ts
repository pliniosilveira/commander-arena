/** A resolving spell gives a target creature an activated or triggered ability until end of turn. */
import type { IrClause, IrQuotedAbility } from '../ir/types';
import { arg, type Effects, eachObject, failure } from './clauses';
import { lowerQuotedGrantedAbility } from './quoted-ability';
import type { Lowering } from './types';

export const GRANT_ABILITY: Lowering<IrClause, Effects> = {
  head: 'grantAbility',
  id: 'lower.grant-ability',
  needs: ['effect:grantAbility', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    if (clause.duration?.scope !== 'untilEndOfTurn') return failure(clause);
    const quoted = arg(clause, 'ability');
    if (quoted?.kind !== 'quoted') return failure(clause);
    const ability = lowerQuotedGrantedAbility(quoted as IrQuotedAbility, clause, ctx, ['creature']);
    if (!ability.ok) return ability;
    return eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'grantAbility',
        objects,
        abilities: [ability.value],
        duration: 'untilEndOfTurn',
      }),
      'objects',
      { token: true },
    );
  },
};

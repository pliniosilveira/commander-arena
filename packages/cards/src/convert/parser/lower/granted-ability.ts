/** A resolving spell gives a target creature an activated or triggered ability until end of turn. */
import type { IrClause, IrQuotedAbility } from '../ir/types';
import { arg, type Effects, eachObject, failure } from './clauses';
import { lowerQuotedGrantedAbility, lowerQuotedGrantedManaAbility } from './quoted-ability';
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

/**
 * "Until your next turn, creatures you control gain \"{T}: Add one mana of any color.\"" (issue 145, Song of Freyalise; CR 613.1f, 605.1a, 611.2a, 611.2c, 500.1): the engine's
 * `grantAbility` of a mana ability to the permanents the noun names as the effect resolves, until the next turn of the controller begins.
 */
export const GRANT_MANA_ABILITY: Lowering<IrClause, Effects> = {
  head: 'grantManaAbility',
  id: 'lower.grant-mana-ability',
  needs: ['effect:grantAbility', 'duration:untilYourNextTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    if (clause.duration?.scope !== 'untilYourNextTurn') return failure(clause);
    const quoted = arg(clause, 'ability');
    if (quoted?.kind !== 'quoted') return failure(clause);
    const mana = lowerQuotedGrantedManaAbility(
      quoted as IrQuotedAbility,
      clause,
      ['creature'],
      ctx,
    );
    if (!mana.ok) return mana;
    return eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'grantAbility',
        objects,
        abilities: [mana.value],
        duration: 'untilYourNextTurn',
      }),
      'objects',
      { token: true },
    );
  },
};

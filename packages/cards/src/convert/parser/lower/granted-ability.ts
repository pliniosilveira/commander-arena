/** A resolving spell gives a target creature an activated or triggered ability until end of turn. */
import type { IrClause, IrQuotedAbility } from '../ir/types';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import { objectSelectorOf } from './nouns';
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

/**
 * "Each Horror you control gains all activated abilities of target artifact an opponent controls until end of turn. You may spend blue mana as though it were mana of any color to
 * activate those abilities." (Grell Philosopher, CR 611.2c, 613.1f, 609.4b): the engine's `gainActivatedAbilitiesOf` of the group the noun names, with the abilities of the target.
 */
export const GAIN_ACTIVATED_ABILITIES: Lowering<IrClause, Effects> = {
  head: 'gainActivatedAbilities',
  id: 'lower.gain-activated-abilities',
  needs: [
    'effect:gainActivatedAbilitiesOf',
    'selector:target',
    'selector:each',
    'duration:untilEndOfTurn',
  ],
  takesDuration: true,
  lower(clause, ctx) {
    if (clause.duration?.scope !== 'untilEndOfTurn') return failure(clause);
    const from = operand(clause, 'from');
    if (from?.kind !== 'noun' || from.det !== 'target') return failure(clause);
    const source = objectSelectorOf(from, ctx);
    if (!source.ok) return source;
    if (source.value.kind !== 'target') return failure(clause);
    const blue = arg(clause, 'blueAsAnyColor');
    if (blue !== undefined && blue.kind !== 'flag') return failure(clause);
    const taken = source.value;
    return eachObject(clause, ctx, (objects) => ({
      kind: 'gainActivatedAbilitiesOf',
      to: objects,
      from: taken,
      duration: 'untilEndOfTurn',
      ...(blue?.value === true ? { blueAsAnyColor: true as const } : {}),
    }));
  },
};

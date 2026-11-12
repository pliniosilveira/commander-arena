/**
 * Lowering of the die roll (D-271, CR 706): "roll a four-sided die" is the engine's `rollDie`. The sentences after it that read the result are
 * conditional sentences, whose condition `condition.die-result` the lowering of conditions checks against the sides this lowering records.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * `roll`: one die of N sides (CR 706.1, 706.1a). The engine rolls for the controller; a roll that carries a "you may", a condition or a duration is not
 * lowered (the generic gate of `lowerClause`), and a second roll in the same text is refused: "the result" would then name one of two rolls, which the text
 * does not say (CR 706.3b: one ability, one roll and what its result does).
 */
export const ROLL: Lowering<IrClause, Effects> = {
  head: 'roll',
  id: 'lower.roll-die',
  needs: ['effect:rollDie'],
  lower: (clause, ctx) => {
    const sides = clause.args.sides;
    if (sides?.kind !== 'number' || ctx.dieSides !== null) return failure(clause);
    ctx.dieSides = sides.value;
    return { ok: true, value: [{ kind: 'rollDie', sides: sides.value }], rule: clause.rule };
  },
};

export const ARDEN_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [ROLL];

/** The features the lowerings of this file and its conditions name, for the dimension test. */
export const ARDEN_NEEDS = [
  'effect:rollDie',
  'condition:dieResult',
  'condition:thisInYourGraveyard',
  'ability:functionsInGraveyard',
] as const;

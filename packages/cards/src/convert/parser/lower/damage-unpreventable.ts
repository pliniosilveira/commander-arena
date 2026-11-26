/** Lowering of "Damage can't be prevented this turn." (Stomp, CR 615.12): the engine's `damageCantBePreventedThisTurn`. */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

export const DAMAGE_CANT_BE_PREVENTED_THIS_TURN: Lowering<IrClause, Effects> = {
  head: 'damageCantBePreventedThisTurn',
  id: 'lower.damage-cant-be-prevented-this-turn',
  needs: ['effect:damageCantBePreventedThisTurn'],
  lower: (clause) => ({
    ok: true,
    value: [{ kind: 'damageCantBePreventedThisTurn' }],
    rule: clause.rule,
  }),
};

export const DAMAGE_UNPREVENTABLE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DAMAGE_CANT_BE_PREVENTED_THIS_TURN,
];

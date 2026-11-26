/**
 * Lowering of "Clash with defending player." (CR 701.30b, 508.5): the engine's `clash` against the defending player, read only in the triggered ability of an attacking creature
 * (`ctx.selfAttackTrigger`: the source is the attacker). One clash in a text, as for `clash` (`lower/arden.ts`): "if you win" would otherwise name one of two.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

export const CLASH_DEFENDING: Lowering<IrClause, Effects> = {
  head: 'clashDefending',
  id: 'lower.clash-defending',
  needs: ['effect:clash', 'selector:defendingPlayer'],
  lower: (clause, ctx) => {
    if (ctx.clashed || !ctx.selfAttackTrigger) return failure(clause);
    ctx.clashed = true;
    return {
      ok: true,
      value: [{ kind: 'clash', against: { kind: 'defendingPlayer' } }],
      rule: clause.rule,
    };
  },
};

export const CLASH_DEFENDING_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [CLASH_DEFENDING];

/** The features the lowering of this file names, for the dimension test. */
export const CLASH_DEFENDING_NEEDS = ['effect:clash', 'selector:defendingPlayer'] as const;

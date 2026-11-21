/**
 * Lowerings of group 10 of the Ahoy Mateys deck (stack and cost effects): "Each creature that convoked this spell connives." (CR 702.51a, 701.50a) and "Each player reveals the top card of
 * their library. For each nonland card revealed this way, you create a Map token." (CR 701.20a, 608.2c).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { LowerContext, Lowering, LowerResult } from './types';

/** "Each creature that convoked this spell connives": the engine's `connive` of the creatures the caster tapped for Convoke. */
const CONVOKERS_CONNIVE: Lowering<IrClause, Effects> = {
  head: 'convokersConnive',
  id: 'lower.convokers-connive',
  needs: ['effect:connive', 'selector:convokers'],
  lower: (clause) => ({
    ok: true,
    value: [{ kind: 'connive', objects: { kind: 'convokers' } }],
    rule: clause.rule,
  }),
};

/**
 * "Each player reveals the top card of their library. For each nonland card revealed this way, you create a Map token": the engine's `revealTopBranches` of each player, one branch for the
 * cards that are not lands, whose token the controller of the ability creates (`asController`: "you" is not the player who revealed).
 */
export function revealEachTokenLowering(
  lowerToken: (clause: IrClause, ctx: LowerContext) => LowerResult<Effects>,
): Lowering<IrClause, Effects> {
  return {
    head: 'revealEachTokenForNonland',
    id: 'lower.reveal-each-token-for-nonland',
    needs: ['effect:revealTopBranches', 'effect:createToken'],
    lower(clause, ctx) {
      const token = arg(clause, 'token');
      if (token?.kind !== 'token') return failure(clause);
      const made = lowerToken({ ...clause, verb: 'createToken', args: { token } }, ctx);
      if (!made.ok) return made;
      const [only, ...rest] = made.value;
      if (only === undefined || rest.length > 0) return failure(clause);
      const onMatch: Effect = only;
      return {
        ok: true,
        value: [
          {
            kind: 'revealTopBranches',
            player: { kind: 'eachPlayer' },
            branches: [{ ifMatches: { notTypes: ['land'] }, onMatch, asController: true }],
          },
        ],
        rule: clause.rule,
      };
    },
  };
}

export const AHOY_G10_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [CONVOKERS_CONNIVE];

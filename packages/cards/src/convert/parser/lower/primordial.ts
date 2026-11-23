/**
 * Lowering of "for each opponent, you may put up to one target creature card from that player's graveyard onto the battlefield under your control" (Sepulchral Primordial).
 */
import type { IrClause } from '../ir/types';
import { type Effects, eachObject, failure } from './clauses';
import type { Lowering } from './types';

/**
 * The engine's `moveToZone` to the battlefield of the cards a slot of one target for each opponent names (CR 115.1, 404.1, 110.2a, 608.2c: they enter together under the controller's
 * control), as a `may` ("you may": the controller is asked whether to put them; "up to one" already lets each opponent's card go unchosen).
 */
export const PUT_PER_OPPONENT_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'putPerOpponentGraveyard',
  id: 'lower.put-per-opponent-graveyard',
  needs: ['effect:moveToZone', 'effect:may', 'selector:target'],
  lower(clause, ctx) {
    const lowered = eachObject(clause, ctx, (objects) => ({
      kind: 'moveToZone',
      objects,
      to: 'battlefield',
      controller: 'you',
    }));
    if (!lowered.ok) return lowered;
    if (lowered.value.length !== 1) return failure(clause);
    return {
      ok: true,
      value: lowered.value.map((effect) => ({ kind: 'may' as const, effect })),
      rule: clause.rule,
    };
  },
};

export const PRIMORDIAL_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PUT_PER_OPPONENT_GRAVEYARD,
];

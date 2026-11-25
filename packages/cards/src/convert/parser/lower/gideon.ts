/**
 * "During target opponent's next turn, creatures that player controls attack ~ if able." (First Flight starter commander decks, Gideon Jura; CR 508.1d, 611.2a): the engine's
 * `requireAttackSource`, a requirement on the creatures of a target player read whenever that player declares attackers.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

export const REQUIRE_ATTACK_SOURCE: Lowering<IrClause, Effects> = {
  head: 'requireAttackSource',
  id: 'lower.require-attack-source',
  needs: ['effect:requireAttackSource'],
  lower(clause, ctx) {
    const named = arg(clause, 'player');
    // "attacks if able" (Rowan Kenrith) has no permanent to attack. Otherwise only the ability of a permanent has one ("~").
    const anything = arg(clause, 'anything')?.kind === 'flag';
    // The player is one chosen as the ability goes on the stack.
    if (
      named?.kind !== 'noun' ||
      named.det !== 'target' ||
      (!anything && ctx.owner !== 'ability')
    ) {
      return failure(clause);
    }
    const player = playerSelectorOf(named, ctx);
    if (!player.ok) return player;
    const effect: Effect = {
      kind: 'requireAttackSource',
      player: player.value,
      duration: 'untilEndOfTheirNextTurn',
      ...(anything ? { anything: true as const } : {}),
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const GIDEON_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [REQUIRE_ATTACK_SOURCE];

/** Features the lowerings of this file can name, for the dimension test. */
export const GIDEON_NEEDS: readonly FeatureRef[] = ['effect:requireAttackSource'];

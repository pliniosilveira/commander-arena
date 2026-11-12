/**
 * Lowerings of the Angel of Destiny group (D-269): "Each player ~ attacked this turn loses the game." (CR 104.3e, 508.6).
 */

import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/** "<players> loses the game." (CR 104.3e): the engine's `loseGame` for the players the noun names. */
export const LOSE_GAME: Lowering<IrClause, Effects> = {
  head: 'loseGame',
  id: 'lower.lose-game',
  needs: ['effect:loseGame'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    return {
      ok: true,
      value: [{ kind: 'loseGame', player: player.value }],
      rule: clause.rule,
    };
  },
};

/** Features the lowerings of this file can name, for the dimension test. */
export const DESTINY_NEEDS: readonly FeatureRef[] = ['effect:loseGame', 'selector:attackedPlayers'];

export const DESTINY_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [LOSE_GAME];

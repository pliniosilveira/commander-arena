/**
 * Lowering of "You win the game." (CR 104.2b: an effect may state that a player wins the game), Halo Fountain.
 */

import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/** "You win the game." (CR 104.2b): the engine's `winGame` for the player the noun names. */
export const WIN_GAME: Lowering<IrClause, Effects> = {
  head: 'winGame',
  id: 'lower.win-game',
  needs: ['effect:winGame'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    return {
      ok: true,
      value: [{ kind: 'winGame', player: player.value }],
      rule: clause.rule,
    };
  },
};

/** Features the lowerings of this file can name, for the dimension test. */
export const WIN_GAME_NEEDS: readonly FeatureRef[] = ['effect:winGame'];

export const WIN_GAME_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [WIN_GAME];

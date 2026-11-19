/**
 * "You and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you
 * revealed into your hand." (CR 701.20a, 119.3, 202.3): the engine's `revealTopDuel` of the two players (`all` of you and the target opponent).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

export const REVEAL_TOP_DUEL: Lowering<IrClause, Effects> = {
  head: 'revealTopDuel',
  id: 'lower.reveal-top-duel',
  needs: ['effect:revealTopDuel'],
  lower(clause, ctx) {
    const named = arg(clause, 'players');
    // "The other player" is one player: you and one target opponent (the engine refuses any other list).
    const other = named?.kind === 'noun' ? named.members?.[1] : undefined;
    if (
      named?.kind !== 'noun' ||
      named.det !== 'players' ||
      named.members?.length !== 2 ||
      other?.det !== 'target' ||
      other.filter.player !== 'opponent'
    ) {
      return failure(clause);
    }
    const players = playerSelectorOf(named, ctx);
    if (!players.ok) return players;
    const effect: Effect = { kind: 'revealTopDuel', players: players.value };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const REVEAL_TOP_DUEL_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [REVEAL_TOP_DUEL];

/** Features the lowerings of this file can name, for the dimension test. */
export const REVEAL_TOP_DUEL_NEEDS: readonly FeatureRef[] = ['effect:revealTopDuel'];

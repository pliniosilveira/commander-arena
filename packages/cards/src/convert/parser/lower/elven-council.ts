/**
 * Lowerings of the Elven Council deck (Tales of Middle-earth Commander), group "tokens and shuffles": "Target player shuffles their graveyard into their library." The search
 * of each player ("Each player searches their library for a basic land card, puts it onto the battlefield, then shuffles.") is the `search` lowering with the `may` flag false.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * CR 115.1, 701.24, 404.1, 108.3: a player target and the engine's `moveToZone` of every card in that player's graveyard (`each` selected by the owner the target names) to the
 * library of its owner, which is the player's, then the `shuffle` of that player's library (the shuffle happens whether or not a card got there, CR 701.24). With no player chosen
 * the owners are nobody's and nothing moves.
 */
const SHUFFLE_GRAVEYARD_OF: Lowering<IrClause, Effects> = {
  head: 'shuffleGraveyardOf',
  id: 'lower.shuffle-graveyard-of',
  needs: ['effect:moveToZone', 'effect:shuffle', 'selector:target', 'selector:ownerRef'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    if (player.value.kind !== 'target') return failure(clause);
    const effects: Effect[] = [
      {
        kind: 'moveToZone',
        objects: { kind: 'each', filter: { zone: 'graveyard', owner: player.value } },
        to: 'library',
      },
      { kind: 'shuffle', player: player.value },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

export const ELVEN_COUNCIL_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SHUFFLE_GRAVEYARD_OF,
];

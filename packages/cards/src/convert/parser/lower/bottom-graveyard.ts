/**
 * Lowering of "Target player puts all the cards from their graveyard on the bottom of their library in a random order." (Endurance).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * CR 115.1, 401.4, 404.1, 108.3: a player target (declared by the noun, none to one when it says "up to one") and the engine's `moveToZone` of every card in that player's
 * graveyard (`each` selected by the owner the target names) to the bottom of the library of its owner in a random order from the game's seeded generator (`random`).
 * With no player chosen the owners are nobody's and nothing moves.
 */
const BOTTOM_GRAVEYARD_RANDOM: Lowering<IrClause, Effects> = {
  head: 'bottomGraveyardRandom',
  id: 'lower.bottom-graveyard-random',
  needs: ['effect:moveToZone', 'selector:target', 'selector:ownerRef'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    if (player.value.kind !== 'target') return failure(clause);
    const effects: Effect[] = [
      {
        kind: 'moveToZone',
        objects: {
          kind: 'each',
          filter: { zone: 'graveyard', owner: player.value },
        },
        to: 'library',
        position: 'bottom',
        random: true,
      },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

export const BOTTOM_GRAVEYARD_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  BOTTOM_GRAVEYARD_RANDOM,
];

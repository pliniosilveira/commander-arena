/**
 * Lowerings of group A of the Witherbloom Witchcraft deck (issue 190): Suffer the Past.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { objectRefOf, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Exile X target cards from target player's graveyard" (CR 115.1, 601.2b-c, 404.1, 406.1): a player target, declared first, and a slot of cards (`countX`, as many as
 * the X announced; `ownedByTarget`: only cards of that player's graveyard), the engine's `exile` of those cards. Only a spell's own text announces an X before its targets
 * (the noun lowering refuses the slot anywhere else).
 */
const EXILE_GRAVEYARD_CARDS_OF_PLAYER: Lowering<IrClause, Effects> = {
  head: 'exileGraveyardCardsOfPlayer',
  id: 'lower.exile-graveyard-cards-of-player',
  needs: ['effect:exile', 'selector:target', 'selector:ownedByTarget', 'selector:countX'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    const cards = arg(clause, 'cards');
    if (who?.kind !== 'noun' || cards?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    if (player.value.kind !== 'target') return failure(clause);
    const playerSlot = player.value.id;
    const objects = objectRefOf(cards, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'target') return failure(clause);
    const slot = objects.value.id;
    const index = ctx.targets.findIndex((t) => t.id === slot);
    const spec = ctx.targets[index];
    if (spec === undefined || spec.what.kind !== 'object' || spec.countX !== true) {
      return failure(clause);
    }
    ctx.targets[index] = { ...spec, ownedByTarget: playerSlot };
    const effects: Effect[] = [{ kind: 'exile', objects: objects.value }];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/**
 * "For each card exiled this way, that player loses 1 life and you gain 1 life" (CR 608.2c, 119.3, 119.4): after the exile of the instruction before it, the player
 * the text named loses, and the controller gains, as many life as cards were exiled (`movedCount`: one life for each).
 */
const DRAIN_FOR_EACH_EXILED: Lowering<IrClause, Effects> = {
  head: 'drainForEachExiled',
  id: 'lower.drain-for-each-exiled',
  needs: ['effect:loseLife', 'effect:gainLife', 'amount:movedCount'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'exile') return failure(clause);
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    const blocked = missingFeatures(['amount:movedCount']);
    if (blocked.length > 0) return failure(clause, blocked);
    const effects: Effect[] = [
      { kind: 'loseLife', player: player.value, amount: { kind: 'movedCount' } },
      { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'movedCount' } },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

export const WITHERBLOOM_A_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_GRAVEYARD_CARDS_OF_PLAYER,
  DRAIN_FOR_EACH_EXILED,
];

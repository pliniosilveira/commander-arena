/**
 * Lowerings of the Quandrix deck (Secrets of Strixhaven Commander): "Target player shuffles up to three target cards from their graveyard into their library."
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { objectRefOf, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Target player shuffles up to three target cards from their graveyard into their library" (CR 115.1, 701.24, 404.1, 108.3): a player target and a slot of
 * cards (`ownedByTarget`: only cards of that player's graveyard), the engine's `moveToZone` of those cards to the library (each into the library of its owner,
 * which is the player's) and the `shuffle` of that player. The shuffle happens whether or not a card got there (CR 701.24: the player shuffles their library).
 */
const SHUFFLE_GRAVEYARD_CARDS: Lowering<IrClause, Effects> = {
  head: 'shuffleGraveyardCards',
  id: 'lower.shuffle-graveyard-cards',
  needs: ['effect:moveToZone', 'effect:shuffle', 'selector:target', 'selector:ownedByTarget'],
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
    if (spec === undefined || spec.what.kind !== 'object') return failure(clause);
    ctx.targets[index] = { ...spec, ownedByTarget: playerSlot };
    const effects: Effect[] = [
      { kind: 'moveToZone', objects: objects.value, to: 'library' },
      { kind: 'shuffle', player: player.value },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/**
 * "Move all counters from target nonland permanent you control onto another target nonland permanent you control" (CR 122.1, 122.6, 115.3): the engine's
 * `moveAllCounters` between the two targets; the second slot differs from the first (the noun says "another").
 */
const MOVE_ALL_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'moveAllCounters',
  id: 'lower.move-all-counters',
  needs: ['effect:moveAllCounters', 'selector:target'],
  lower(clause, ctx) {
    const from = arg(clause, 'from');
    const to = arg(clause, 'to');
    if (from?.kind !== 'noun' || to?.kind !== 'noun') return failure(clause);
    const source = objectRefOf(from, ctx);
    if (!source.ok) return source;
    const destination = objectRefOf(to, ctx);
    if (!destination.ok) return destination;
    if (source.value.kind !== 'target' || destination.value.kind !== 'target') {
      return failure(clause);
    }
    return {
      ok: true,
      value: [{ kind: 'moveAllCounters', from: source.value, to: destination.value }],
      rule: clause.rule,
    };
  },
};

export const QUANDRIX_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SHUFFLE_GRAVEYARD_CARDS,
  MOVE_ALL_COUNTERS,
];

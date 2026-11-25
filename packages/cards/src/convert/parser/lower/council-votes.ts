/**
 * Lowerings of the council cards of the Elven Council deck (issue 17): "Each player returns up to two cards from their graveyard to their hand" (Sail into the West) and the repeat of one
 * instruction "for each Redhorn Pass vote" (Travel Through Caradhras, `repeatFor`, applied by `lowerClause`).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

/**
 * "Each player returns up to two cards from their graveyard to their hand" (CR 101.4, 608.2d, 400.3): every player in turn order, as themselves, chooses none to two cards of their
 * own graveyard, which go to their hand. The engine's `forEachPlayer` with `runsAs: 'each'` of a `moveToZone` of a chosen card.
 */
export const EACH_PLAYER_RETURNS_UP_TO: Lowering<IrClause, Effects> = {
  head: 'eachPlayerReturnsUpTo',
  id: 'lower.each-player-returns-up-to',
  needs: ['effect:forEachPlayer', 'effect:moveToZone', 'selector:choose'],
  lower(clause) {
    const count = arg(clause, 'count');
    if (count?.kind !== 'number') return failure(clause);
    const effect: Effect = {
      kind: 'forEachPlayer',
      players: { kind: 'eachPlayer' },
      runsAs: 'each',
      effect: {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: { zone: 'graveyard', controller: 'you' },
          count: count.value,
          optional: true,
        },
        to: 'hand',
      },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Put a +1/+1 counter on your Ring-bearer" (CR 701.54e, 122.6): the engine's `addCounters` on the `ringBearer` object of the controller (nothing when they have none).
 */
export const ADD_COUNTERS_RING_BEARER: Lowering<IrClause, Effects> = {
  head: 'addCountersRingBearer',
  id: 'lower.add-counters-ring-bearer',
  needs: ['effect:addCounters', 'selector:ringBearer'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    if (counter?.kind !== 'counterSpec') return failure(clause);
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const effect: Effect = {
      kind: 'addCounters',
      objects: { kind: 'ringBearer' },
      counter: counter.name,
      count: count.value,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** Features the lowerings of this file can name, for the dimension test. */
export const COUNCIL_VOTES_NEEDS: readonly FeatureRef[] = [
  'effect:forEachPlayer',
  'effect:moveToZone',
  'selector:choose',
  'effect:repeat',
  'effect:addCounters',
  'selector:ringBearer',
  'amount:votesFor',
];

export const COUNCIL_VOTES_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EACH_PLAYER_RETURNS_UP_TO,
  ADD_COUNTERS_RING_BEARER,
];

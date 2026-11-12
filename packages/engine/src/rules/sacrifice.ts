/**
 * Sacrifice (CR 701.21). To sacrifice a permanent, its controller moves it from the battlefield
 * directly to its owner's graveyard; a player can't sacrifice a permanent they don't control, and
 * sacrificing is not destroying (CR 701.21a), so indestructible does not matter.
 *
 * Every sacrifice, whether made by an effect or paid as a cost, goes through `sacrificePermanent`,
 * which emits `sacrificed` after the zone change so "whenever you sacrifice a permanent" abilities
 * can see it (CR 603.10a: they look back in time).
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { objectsInZone } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { matchesFilter } from './select';
import { moveObject } from './zones';

/** Sacrifices `id` if it is a permanent `seat` controls. Returns null if it cannot be sacrificed. */
export function sacrificePermanent(
  state: GameState,
  id: ObjectId,
  seat: SeatId,
  lkiRecorded = false,
): { state: GameState; events: GameEvent[] } | null {
  const obj = state.objects[id];
  if (obj?.zone !== 'battlefield' || controllerOf(state, obj) !== seat) return null;
  // D-283 (CR 603.10a): permanents sacrificed together keep the last-known information recorded as the event began (`rules/simultaneous.ts`).
  const moved = moveObject(state, {
    object: id,
    to: 'graveyard',
    ...(lkiRecorded ? { lkiRecorded: true as const } : {}),
  });
  // A battlefield permanent going to a graveyard never needs the commander decision (CR 903.9b
  // applies to hand and library), so the move is always complete.
  if (moved.kind !== 'done') return null;
  return {
    state: moved.state,
    events: [...moved.events, { kind: 'sacrificed', permanent: id, controller: seat }],
  };
}

/**
 * The permanents `seat` may choose for "sacrifice a <filter>" (CR 701.21a) or "return a <filter>
 * you control to its owner's hand": those the filter matches among the permanents they control.
 * `source` is what "another" excludes.
 */
export function controlledCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter,
): ObjectId[] {
  const scoped: ObjectFilter = { ...filter, zone: 'battlefield', controller: 'you' };
  return objectsInZone(state, 'battlefield').filter((id) => {
    const obj = state.objects[id];
    return obj !== undefined && matchesFilter(state, obj, scoped, { controller: seat, source });
  });
}

/** The permanents `seat` may choose to sacrifice (CR 701.21a): see `controlledCandidates`. */
export const sacrificeCandidates = controlledCandidates;

/**
 * The permanents `seat` may tap for "tap N untapped <filter> you control" (D-133, CR 118.3): the untapped ones it controls
 * that match. Summoning sickness does not matter (CR 302.6: only a creature's own {T} ability is held back by it).
 */
export function tapCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter,
): ObjectId[] {
  return controlledCandidates(state, seat, source, { ...filter, tapped: false });
}

/**
 * Static abilities of permanents (CR 604) that the engine reads outside `derive`: "You have no
 * maximum hand size." (CR 402.2), found on the battlefield permanents a player controls, and "Damage isn't removed from this creature during
 * cleanup steps." (CR 514.2, D-192), read for one permanent. The ones
 * that change characteristics ("+N/+N", granted keywords) are applied by `rules/derive-statics.ts`.
 */
import type { ObjectId, SeatId } from '../ids';
import { getObject, getSeat } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';

/**
 * Whether the permanent has a static ability that says "Damage isn't removed from this creature during cleanup steps" (CR 514.2, D-192),
 * read from the abilities it has now (so "loses all abilities" turns it off, CR 613.1f). The cleanup step leaves its damage on it.
 */
export function keepsDamage(state: GameState, obj: GameObject): boolean {
  return (
    mayHaveStatic(state, obj, 'keepsDamage') &&
    derive(state, obj).abilities.some((a) => a.kind === 'static' && a.static.kind === 'keepsDamage')
  );
}

/**
 * Whether `seat` controls a permanent that says "You have no maximum hand size" (CR 402.2), so they
 * discard nothing as cleanup begins (CR 514.1). Several such permanents do the same as one.
 */
export function hasNoMaximumHandSize(state: GameState, seat: SeatId): boolean {
  return state.battlefield.some((id) => {
    const obj = getObject(state, id);
    return (
      controllerOf(state, obj) === seat &&
      mayHaveStatic(state, obj, 'noMaximumHandSize') &&
      derive(state, obj).abilities.some(
        (a) => a.kind === 'static' && a.static.kind === 'noMaximumHandSize',
      )
    );
  });
}

/**
 * CR 305.2 (Lands), D-125: how many lands `seat` can play in a turn. One, plus what the effects of this turn
 * add for the active player (`turn.extraLandDrops`), plus `count` for each battlefield permanent with "You may play an additional
 * land on each of your turns" that the seat controls, or any permanent when the ability says each player
 * (CR 305.2: continuous effects may increase this number, and several add up). It is read from the derived
 * abilities, so a permanent that lost its abilities adds nothing. Whether a land may be played now compares
 * this with the lands already played (CR 305.2a); only the active player ever plays one (CR 305.3).
 */
export function landPlaysAllowed(state: GameState, seat: SeatId): number {
  let allowed = 1 + (seat === state.turn.activeSeat ? state.turn.extraLandDrops : 0);
  for (const id of state.battlefield) {
    const obj = getObject(state, id);
    if (!mayHaveStatic(state, obj, 'additionalLandDrops')) continue;
    for (const a of derive(state, obj).abilities) {
      if (a.kind !== 'static' || a.static.kind !== 'additionalLandDrops') continue;
      if (controllerOf(state, obj) === seat || a.static.eachPlayer === true)
        allowed += a.static.count;
    }
  }
  return allowed;
}

/**
 * CR 401.5 (Library), D-125: whether `seat` may look at the top card of their own library now: they control a
 * battlefield permanent that says "You may look at the top card of your library any time". Several do the same
 * as one. Read from the derived abilities, so a permanent that lost its abilities gives nothing. While a spell
 * is being cast or an ability activated, a top card that changed since the transaction began stays hidden
 * until it is done (CR 401.5): the top card is shown only when it is the one that was on top at the start.
 */
export function topCardVisibleTo(state: GameState, seat: SeatId): ObjectId | null {
  const top = getSeat(state, seat).library[0];
  if (top === undefined) return null;
  const allowed = state.battlefield.some((id) => {
    const obj = getObject(state, id);
    return (
      controllerOf(state, obj) === seat &&
      mayHaveStatic(state, obj, 'lookAtTopOfLibrary') &&
      derive(state, obj).abilities.some(
        (a) => a.kind === 'static' && a.static.kind === 'lookAtTopOfLibrary',
      )
    );
  });
  if (!allowed) return null;
  // CR 401.5: the new top card of a library that changed during a cast or an activation is not revealed yet.
  if (state.casting !== null && getSeat(state.casting.snapshot, seat).library[0] !== top) {
    return null;
  }
  return top;
}

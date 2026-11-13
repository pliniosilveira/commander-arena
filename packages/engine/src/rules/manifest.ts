/**
 * Manifest (CR 701.40, D-309): "To manifest a card, turn it face down. It becomes a 2/2 face-down creature card with no text, no name, no subtypes, and no mana cost. Put that
 * card onto the battlefield face down." The card is the top card of a library; the permanent is under the control of the player who manifests (CR 110.2a), which is the owner
 * of the library for "manifest the top card of your library" and "its controller manifests the top card of their library", and the player the effect names for "manifest the
 * top card of target opponent's library". Several cards are manifested one at a time (CR 701.40e); an empty library manifests nothing (CR 701.40f: the card stays where it
 * was, here no card at all).
 *
 * The permanent is made by `moveObject` with `entersFaceDown`: turned face down before it enters (CR 708.3), a new object (CR 400.7) labelled for its controller
 * (CR 708.6). The events name no card (CR 708.5: nobody but its controller may look at it).
 */
import type { Effect } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';
import { moveObject } from './zones';

/**
 * `manifesting` manifests the top card of the library of `from`: puts it onto the battlefield face down under their control. Nothing changes when that library is empty or the
 * move does not complete (CR 701.40f).
 */
export function manifestTop(
  state: GameState,
  manifesting: SeatId,
  from: SeatId,
): { state: GameState; events: GameEvent[]; manifested: boolean } {
  const top = getSeat(state, from).library[0];
  if (top === undefined) return { state, events: [], manifested: false };
  const moved = moveObject(state, {
    object: top,
    to: 'battlefield',
    toSeat: manifesting,
    entersFaceDown: 'manifest',
  });
  if (moved.kind !== 'done' || moved.newObject === null) {
    return { state, events: [], manifested: false };
  }
  return {
    state: moved.state,
    events: [
      ...moved.events,
      { kind: 'manifested', seat: manifesting, from, object: moved.newObject },
    ],
    manifested: true,
  };
}

/** The effect: each player `player` names manifests the top card of their own library, or of each library `fromLibraryOf` names (CR 701.40a, 101.4: in turn order). */
export function runManifest(
  state: GameState,
  effect: Extract<Effect, { kind: 'manifest' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  let next = state;
  const events: GameEvent[] = [];
  let count = 0;
  for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
    const libraries =
      effect.fromLibraryOf === undefined
        ? [seat]
        : resolvePlayers(state, effect.fromLibraryOf, ctx, targets);
    for (const from of libraries) {
      const r = manifestTop(next, seat, from);
      next = r.state;
      events.push(...r.events);
      if (r.manifested) count += 1;
    }
  }
  return { ...done(next, events), performed: count };
}

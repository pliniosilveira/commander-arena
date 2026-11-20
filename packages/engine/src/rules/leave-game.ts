/**
 * A player leaves a game that goes on (CR 800.4, issue 336): one or more seats have been marked `hasLost` (a concession, CR 104.3a, a loss by a
 * state-based action, CR 704.5a to 704.5c and 704.6c, or an effect, CR 104.3e), and this removes them from the game.
 *
 * CR 800.4a, in this order:
 * 1. every continuous effect that gives control of an object to a leaving player ends, so a permanent they took goes back to its owner;
 * 2. every object a leaving player owns leaves the game, from every zone (a spell, an ability and a token with them), with no zone change and so no
 *    "leaves the battlefield" trigger: an object that leaves the game is not an object that moved;
 * 3. what a leaving player still controls but does not own (a permanent put under their control, a spell cast from another player's zone) is exiled.
 * A trigger of theirs that is waiting is not put on the stack and a delayed trigger of theirs is gone (CR 800.4d); `putTriggersOnStack` drops the ones
 * that trigger afterwards. Nothing goes under the control of a leaving player (CR 800.4b).
 *
 * The seats are all marked before this runs, so one leaving player's permanents cannot change who else can lose (as in `loseTheGame`).
 *
 * It does nothing when fewer than two seats remain: the game is over, and the board the players see at the end is the board it ended with (CR 800.4
 * only describes a game that continues; the result is set by `evaluateGameEnd`).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, patchObject, removeFromZone } from '../state/ops';
import type { GameState } from '../state/types';
import { removeFromCombat } from './combat-removal';
import { controllerOf } from './control';
import { dropEffects } from './control-effects';
import { moveObject, recordLastKnown } from './zones';

export function leaveGame(
  input: GameState,
  seats: readonly SeatId[],
): { readonly state: GameState; readonly events: GameEvent[] } {
  const leaving = new Set(seats);
  if (leaving.size === 0 || input.seats.filter((s) => !getSeat(input, s.id).hasLost).length < 2) {
    return { state: input, events: [] };
  }
  // 1. CR 800.4a: the effects that give them control of anything end.
  const ended = dropEffects(
    input,
    (e) => e.change.kind === 'control' && leaving.has(e.change.seat),
  );
  let state = ended.state;
  const events: GameEvent[] = [...ended.events];

  // 2. CR 800.4a: what they own leaves the game.
  for (const id of Object.keys(state.objects) as ObjectId[]) {
    const obj = state.objects[id];
    if (obj === undefined || !leaving.has(obj.owner)) continue;
    state = recordLastKnown(state, obj);
    if (obj.zone === 'battlefield') state = removeFromCombat(state, id).state;
    state = removeFromZone(state, obj);
    const { [id]: _gone, ...rest } = state.objects;
    state = { ...state, objects: rest };
  }
  // What was attached to what has left is let go; the state-based actions put an Aura that is left alone into its owner's graveyard (CR 704.5m).
  for (const id of Object.keys(state.objects) as ObjectId[]) {
    const obj = state.objects[id];
    if (obj?.attachedTo != null && state.objects[obj.attachedTo] === undefined) {
      state = patchObject(state, id, { attachedTo: null });
    }
  }

  // 3. CR 800.4a: what they control but do not own is exiled.
  for (const id of [...state.battlefield, ...state.stack]) {
    const obj = state.objects[id];
    if (obj === undefined || !leaving.has(controllerOf(state, obj))) continue;
    const moved = moveObject(state, { object: id, to: 'exile' });
    if (moved.kind === 'done') {
      state = moved.state;
      events.push(...moved.events);
    }
  }

  // CR 800.4d: no trigger of theirs goes on the stack.
  state = {
    ...state,
    pendingTriggers: state.pendingTriggers.filter((t) => !leaving.has(t.controller)),
    delayedTriggers: state.delayedTriggers.filter((t) => !leaving.has(t.controller)),
    triggering:
      state.triggering !== null && leaving.has(state.triggering.seat) ? null : state.triggering,
  };
  return { state, events };
}

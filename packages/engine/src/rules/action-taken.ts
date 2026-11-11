/**
 * "Whenever you gain life, you may put that many +1/+1 counters on each creature you control. Do this only once each turn." (CR 603.2h, D-256):
 * the ability triggers only if its controller has not yet taken the action it represents this turn. The action is taken as the ability resolves
 * and its effect begins: an ability without "you may" at the start of its resolution, one with "you may" when its controller accepts. The
 * triggering side is `limitOncePerTurn` in `triggers.ts`; this records what that side reads. The record is of the source object, the ability and the
 * player who took the action (CR 603.2h: "its source's controller"): a permanent that changes controller, or that leaves and returns as a new object
 * (CR 400.7), starts again. Two permanents with the same ability are two sources, each with its own limit (no ruling found to say otherwise).
 */
import type { ObjectId } from '../ids';
import type { GameState } from '../state/types';
import { controllerOf } from './control';

/** Records that the triggered ability on the stack as `object` has had its action taken this turn; the state itself for any other object. */
export function recordActionTaken(state: GameState, object: ObjectId): GameState {
  const obj = state.objects[object];
  const stack = obj?.stack;
  const ability = stack?.ability ?? null;
  if (
    obj === undefined ||
    ability?.kind !== 'triggered' ||
    ability.doOnlyOnceEachTurn !== true ||
    stack?.source === null ||
    stack?.source === undefined ||
    stack.abilityIndex === null
  ) {
    return state;
  }
  // CR 603.2h: the player is the controller of the source, which is the controller of its triggered ability, and "its source's controller" is who
  // has taken the action: a permanent that changes hands mid-turn has a controller that has not taken it yet.
  const entry = {
    object: stack.source,
    abilityIndex: stack.abilityIndex,
    seat: controllerOf(state, obj),
  };
  if (
    state.turnLog.actionTaken.some(
      (a) =>
        a.object === entry.object && a.abilityIndex === entry.abilityIndex && a.seat === entry.seat,
    )
  ) {
    return state;
  }
  return {
    ...state,
    turnLog: { ...state.turnLog, actionTaken: [...state.turnLog.actionTaken, entry] },
  };
}

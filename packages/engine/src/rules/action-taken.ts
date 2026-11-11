/**
 * "Whenever you gain life, you may put that many +1/+1 counters on each creature you control. Do this only once each turn." (CR 603.2h, D-256):
 * the ability triggers only if its controller has not yet taken the action it represents this turn. The action is taken as the ability resolves
 * and its effect begins: an ability without "you may" at the start of its resolution, one with "you may" when its controller accepts. The
 * triggering side is `limitOncePerTurn` in `triggers.ts`; this records what that side reads.
 */
import type { ObjectId } from '../ids';
import type { GameState } from '../state/types';

/** Records that the triggered ability on the stack as `object` has had its action taken this turn; the state itself for any other object. */
export function recordActionTaken(state: GameState, object: ObjectId): GameState {
  const stack = state.objects[object]?.stack;
  const ability = stack?.ability ?? null;
  if (
    ability?.kind !== 'triggered' ||
    ability.doOnlyOnceEachTurn !== true ||
    stack?.source === null ||
    stack?.source === undefined ||
    stack.abilityIndex === null
  ) {
    return state;
  }
  const entry = { object: stack.source, abilityIndex: stack.abilityIndex };
  if (
    state.turnLog.actionTaken.some(
      (a) => a.object === entry.object && a.abilityIndex === entry.abilityIndex,
    )
  ) {
    return state;
  }
  return {
    ...state,
    turnLog: { ...state.turnLog, actionTaken: [...state.turnLog.actionTaken, entry] },
  };
}

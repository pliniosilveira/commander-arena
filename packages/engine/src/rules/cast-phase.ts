/**
 * "If you cast this spell during your main phase" (CR 601.2, 505.1; issue 244). A spell is cast in one phase, and no phase ends while a spell is on the stack
 * (CR 500.4: players receive no priority to end a step with a non-empty stack), so the phase and the active player as the spell resolves are those it was cast in.
 */
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';

/** Whether it is a main phase of a turn of `seat`'s own. */
function inOwnMainPhase(state: GameState, seat: number): boolean {
  return (
    state.turn.activeSeat === seat &&
    (state.turn.phase === 'precombatMain' || state.turn.phase === 'postcombatMain')
  );
}

/**
 * Whether the spell `obj` was cast, or would be cast now, during a main phase of its controller's turn. A copy of a spell is not cast (CR 707.10), so it never was; a
 * card that is not on the stack yet is asked as of now (the slot that depends on it takes no target when it is not met, and an optional one never blocks the cast).
 */
export function castInOwnMainPhase(state: GameState, obj: GameObject): boolean {
  if (obj.stack != null && obj.stack.castFrom === undefined) return false;
  return inOwnMainPhase(state, controllerOf(state, obj));
}

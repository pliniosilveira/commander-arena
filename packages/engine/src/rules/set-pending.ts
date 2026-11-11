/** Making a decision the pending one. It has its own module so that the modules `settle` uses can import it without a cycle. */
import type { NewDecision, PendingDecision } from '../state/decisions';
import type { GameState } from '../state/types';

/** Assigns the next decision id and makes the decision the pending one. */
export function setPending(state: GameState, decision: NewDecision): GameState {
  const id = `d${state.nextDecisionNumber}` as const;
  return {
    ...state,
    nextDecisionNumber: state.nextDecisionNumber + 1,
    pending: { ...decision, id } as PendingDecision,
  };
}

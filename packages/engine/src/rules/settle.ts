/**
 * "Before a player would get priority" (CR 117.5): perform state-based actions repeatedly until
 * none apply, then put triggered abilities on the stack (CR 603.3), and repeat in that order until
 * no state-based action is performed and no ability triggers. Then check whether the game has ended.
 *
 * Triggers are noticed from the events the changes produced (triggers.ts): the events of whatever
 * happened before this call (`prior`) and those of each round of state-based actions.
 */
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';
import { releaseExiled } from './exile-return';
import { checkStateBasedActions, evaluateGameEnd } from './sba';
import { putTriggersOnStack } from './trigger-stack';
import { collectTriggers } from './triggers';

export interface SettleResult {
  readonly state: GameState;
  readonly events: GameEvent[];
  /** True if at least one state-based action was performed or a triggered ability was put on the stack. */
  readonly performed: boolean;
  /** A decision to ask before priority can be given (CR 903.9a, 603.3b). */
  readonly decision: NewDecision | null;
  /** A resolution without a stack object (CR 610.3) is waiting for an answer: `state.pending` is already set. */
  readonly paused?: true;
}

export function settle(input: GameState, prior: readonly GameEvent[] = []): SettleResult {
  let state = collectTriggers(input, prior);
  const events: GameEvent[] = [];
  let performedAny = false;
  for (let guard = 0; guard < 10_000; guard += 1) {
    // CR 610.3: a card exiled "until this leaves the battlefield" is returned right after the permanent leaves, before anything else.
    const released = releaseExiled(state);
    if (released !== null) {
      state = released.state;
      events.push(...released.events);
      performedAny = true;
      if (released.paused) {
        return { state, events, performed: true, decision: null, paused: true };
      }
      state = collectTriggers(state, released.events);
    }
    const r = checkStateBasedActions(state);
    state = collectTriggers(r.state, r.events);
    events.push(...r.events);
    if (r.performed) performedAny = true;
    const end = evaluateGameEnd(state);
    state = end.state;
    events.push(...end.events);
    if (state.result) return { state, events, performed: performedAny, decision: null };
    if (r.decision) return { state, events, performed: performedAny, decision: r.decision };
    if (r.performed) continue;
    // CR 117.5, 603.3b: with no state-based action left, the waiting triggers go on the stack,
    // then state-based actions are checked again.
    if (state.pendingTriggers.length === 0) {
      return { state, events, performed: performedAny, decision: null };
    }
    const put = putTriggersOnStack(state);
    state = put.state;
    events.push(...put.events);
    if (put.events.length > 0) performedAny = true;
    if (put.decision) return { state, events, performed: performedAny, decision: put.decision };
  }
  throw new Error('State-based actions and triggers did not settle');
}

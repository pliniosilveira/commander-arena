/**
 * The Agent interface (SPEC 9, D-010, A10, A28). An agent answers one pending decision at a time.
 * It sees a `GameView` and the decision, never the real `GameState`, and it may not read real time:
 * the clock arrives through the context. An agent that searches (plays moves forward on a copy) asks the
 * context for a `sample`: a determinized state, never the real one (A31, D-161).
 */
import type {
  Action,
  DecisionKind,
  GameState,
  GameView,
  PendingDecision,
} from '@commander-arena/engine';

export interface DecideContext {
  /** Time the agent may spend on this decision, in milliseconds. The host replaces an answer that arrives far past it (A28). */
  readonly budgetMs: number;
  /** Injected clock, in milliseconds. The AI never reads the real time itself. */
  readonly now: () => number;
  /**
   * A determinized copy of the game for the deciding seat (A31, D-161), built only when called: `seed` picks the
   * sample (the same seed gives the same copy; the agent uses its own PRNG to choose seeds). Everything the seat
   * cannot know is drawn again: the other players' hands and libraries (the cards they hold are shuffled
   * among those slots, so their counts and the multiset stay right), the order of the seat's own library and
   * the real game's seed and PRNG. The agent may play the copy forward with `applyAction`; it never contains
   * the hidden truth. Absent when the host provides none; an agent that does not use it pays nothing.
   */
  readonly sample?: (seed: number) => GameState;
}

/** One safe-choice fallback an agent took because a handler failed (SPEC 9). */
export interface FallbackRecord {
  readonly decisionKind: DecisionKind;
  readonly message: string;
}

export interface Agent {
  readonly name: string;
  decide(view: GameView, decision: PendingDecision, ctx: DecideContext): Promise<Action>;
  /**
   * Every fallback taken so far, oldest first. Tests treat any fallback as a failure (SPEC 9).
   * Absent for an agent that cannot fall back.
   */
  readonly fallbacks?: readonly FallbackRecord[];
}

/**
 * Default budget for a decision when the caller does not set one (SPEC 9: 5 s per decision, D-172).
 * A cap, not a delay: the agent's own shares of it (the search stop at 60%, the hard limit at 70%)
 * are fractions of `ctx.budgetMs`.
 */
export const DEFAULT_BUDGET_MS = 5000;

/** What running one instruction of a resolving spell or ability produced. */
import type { ObjectId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import type { GameState, Instruction, ThisWayCounts } from '../state/types';

export interface StepOutcome {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  /** Instructions to run next, ahead of the rest of the queue. */
  readonly front: readonly Instruction[];
  /** Set when the instruction needs a decision and must stay at the head of the queue. */
  readonly needs: NewDecision | null;
  /**
   * The new value of `ResolutionContext.lastMoved` (CR 400.7j), when this instruction changes it:
   * a move effect starting sets it empty, and each move adds the object it produced.
   */
  readonly lastMoved?: readonly ObjectId[];
  /** How much life players lost in this instruction, added to `ResolutionContext.lifeLost` (D-120). */
  readonly lifeLost?: number;
  /** What this instruction did, added to `ResolutionContext.thisWay` for the `thisWay` amounts (D-131). */
  readonly thisWay?: ThisWayCounts;
  /** The ids of the permanents this instruction sacrificed, added to `ResolutionContext.sacrificed` for `sacrificed` (D-177). */
  readonly sacrificed?: readonly ObjectId[];
  /** The tally of a vote this instruction finished, which becomes `ResolutionContext.votes` for the amount `votesFor` (D-194). */
  readonly votes?: Readonly<Record<string, number>>;
  /** How much this instruction did, added to `ResolutionContext.performed` for `didPrevious` and `reflexive` (D-135). */
  readonly performed?: number;
  /** Set by a `may` effect as it comes up: `ResolutionContext.performed` starts again at 0 (D-135). */
  readonly resetPerformed?: true;
}

export function done(
  state: GameState,
  events: readonly GameEvent[] = [],
  front: readonly Instruction[] = [],
): StepOutcome {
  return { state, events, front, needs: null };
}

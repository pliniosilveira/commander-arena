/**
 * The work of one planning of the turn planner (issue 653, step 0). Every view the planner builds (the
 * decisions of its play-outs, the scores of their ends, the opponents' pools) and every action it applies
 * goes through one `PlanCounter`, so the planning's record says what it cost in engine calls and what ended
 * its search: the clock, or a bound of the work. The counts change nothing the agent decides.
 */
import {
  type Action,
  type ApplyResult,
  applyAction,
  type GameState,
  type GameView,
  getView,
  type SeatId,
} from '@commander-arena/engine';

/** What can end a search before every line is scored: the decision's clock, or a bound of the work. */
export type Cut = 'clock' | 'work';

/** What one planning cost, whether or not it ended in a plan. */
export interface PlanWork {
  /** Whether the planning ended in a plan (false: today's line could not be scored, or no planning ran). */
  readonly planned: boolean;
  /** How many play-outs were started. */
  readonly playOuts: number;
  /** The engine steps of all its play-outs. */
  readonly steps: number;
  /** The views it built (`getView`). */
  readonly views: number;
  /** The actions it applied (`applyAction`), refused ones included. */
  readonly applies: number;
  /**
   * What dropped a play-out or stopped the search before every line was scored, or null when nothing did
   * (a refused play-out is not a cut). The clock wins over a work bound when both did.
   */
  readonly cut: Cut | null;
  /** The milliseconds of the decision's clock the planning used (0 on a logical clock). */
  readonly ms: number;
}

/** The running counts of one planning, and the engine calls that keep them. */
export class PlanCounter {
  steps = 0;
  views = 0;
  applies = 0;
  playOuts = 0;
  cut: Cut | null = null;
  /** The most engine steps all the play-outs of the planning may take. */
  readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  /** The view of `state` for `seat`, counted. */
  view(state: GameState, seat: SeatId): GameView {
    this.views += 1;
    return getView(state, seat);
  }

  /** `applyAction`, counted. */
  apply(state: GameState, seat: SeatId, action: Action): ApplyResult {
    this.applies += 1;
    return applyAction(state, seat, action);
  }

  /** Notes what cut the search; the clock is kept once it has cut. */
  stop(why: Cut): void {
    if (this.cut !== 'clock') this.cut = why;
  }

  /** The record of the planning. */
  done(planned: boolean, ms: number): PlanWork {
    return {
      planned,
      playOuts: this.playOuts,
      steps: this.steps,
      views: this.views,
      applies: this.applies,
      cut: this.cut,
      ms,
    };
  }
}

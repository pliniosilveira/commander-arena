/**
 * The work of one planning of the turn planner (issue 653). Every view the planner builds (the decisions of
 * its play-outs, the scores of their ends, the opponents' pools) and every action it applies goes through one
 * `PlanCounter`, so the planning's record says what it cost in engine calls and what ended its search: the
 * clock, or a bound of the work.
 *
 * The counter also keeps what it built, for the planning (step 1). A state never changes (every change of
 * the game makes a new state) and `applyAction` and `getView` are pure functions of their arguments, so the
 * same action applied to the same state, or the same state viewed by the same seat, gives what it gave the
 * first time. Lines that start alike (the land drop, the same first spell, a whole turn that only an ability
 * at the opponent's end step tells apart) play the same steps on the same scenario, and those steps are
 * then taken once. Nothing the agent decides changes: the play-outs take the same steps, which the work
 * bound still counts one by one, and only the engine calls are saved.
 *
 * What is kept holds its states alive, and with them the engine's caches of what it derived on each, until
 * the counter goes at the end of the planning: 70 to 80 KB a step on mid-game precon boards, measured. So a
 * planning keeps the first `KEEP` results and views it builds and no more (about 80 MB at most, where the
 * bound of the work alone would allow some 6,000 steps): the first play-outs, today's line on every scenario,
 * are the ones later lines share most, and a bigger planning still finds what was kept.
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

/**
 * The most engine results, and the most views, one planning keeps (a bound of its memory, not a weight): nine
 * plannings in ten of heuristic self-play on the precons build fewer, the largest about 2,800 of each.
 */
export const KEEP = 1000;

/** What can end a search before every line is scored: the decision's clock, or a bound of the work. */
export type Cut = 'clock' | 'work';

/** What one planning cost, whether or not it ended in a plan. */
export interface PlanWork {
  /** Whether the planning ended in a plan (false: today's line could not be scored, or no planning ran). */
  readonly planned: boolean;
  /** How many play-outs were started. */
  readonly playOuts: number;
  /** The engine steps of all its play-outs (a step taken again from what was kept counts as a step). */
  readonly steps: number;
  /** The views it built (`getView`); a view it already had is not built again. */
  readonly views: number;
  /** The actions the engine applied (`applyAction`), refused ones included; one it already had is not. */
  readonly applies: number;
  /**
   * What dropped a play-out or stopped the search before every line was scored, or null when nothing did
   * (a refused play-out is not a cut). The clock wins over a work bound when both did.
   */
  readonly cut: Cut | null;
  /** The milliseconds of the decision's clock the planning used (0 on a logical clock). */
  readonly ms: number;
}

/**
 * The key of an action for one seat: its JSON, with a field that is present but undefined kept apart from a
 * missing one, and a number JSON cannot write kept apart from null, so two different actions never share it.
 */
function keyOf(seat: SeatId, action: Action): string {
  const text = JSON.stringify(action, (_, value: unknown) =>
    value === undefined
      ? '\u0000undefined'
      : typeof value === 'number' && !Number.isFinite(value)
        ? `\u0000${value}`
        : value,
  );
  return `${seat}:${text}`;
}

/** The running counts of one planning, and the engine calls that keep them (see the module comment). */
export class PlanCounter {
  steps = 0;
  views = 0;
  applies = 0;
  playOuts = 0;
  cut: Cut | null = null;
  /** The most engine steps all the play-outs of the planning may take. */
  readonly limit: number;
  private readonly viewed = new WeakMap<GameState, Map<SeatId, GameView>>();
  private readonly applied = new WeakMap<GameState, Map<string, ApplyResult>>();

  constructor(limit: number) {
    this.limit = limit;
  }

  /** The view of `state` for `seat`: the one kept before, or a new one, counted (and kept, up to `KEEP`). */
  view(state: GameState, seat: SeatId): GameView {
    const kept = this.viewed.get(state)?.get(seat);
    if (kept !== undefined) return kept;
    this.views += 1;
    const view = getView(state, seat);
    if (this.views <= KEEP) {
      const bySeat = this.viewed.get(state) ?? new Map<SeatId, GameView>();
      bySeat.set(seat, view);
      this.viewed.set(state, bySeat);
    }
    return view;
  }

  /**
   * `applyAction`: the result kept before for this state, seat and action, or a new one, counted (and kept, up
   * to `KEEP`).
   */
  apply(state: GameState, seat: SeatId, action: Action): ApplyResult {
    const key = keyOf(seat, action);
    const kept = this.applied.get(state)?.get(key);
    if (kept !== undefined) return kept;
    this.applies += 1;
    const result = applyAction(state, seat, action);
    if (this.applies <= KEEP) {
      const byAction = this.applied.get(state) ?? new Map<string, ApplyResult>();
      byAction.set(key, result);
      this.applied.set(state, byAction);
    }
    return result;
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

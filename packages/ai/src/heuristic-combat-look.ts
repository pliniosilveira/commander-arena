/**
 * The combat look-ahead (issue 653, step 5). The attack and block searches (`heuristic-attacks.ts`,
 * `heuristic-blocks.ts`) play each candidate to the end of the combat and score that position, with the
 * opponent's next attack estimated by a formula (`heuristic-crack-back.ts`). Here the best of them are played
 * on to the start of the agent's next turn, through the rest of this turn and the opponents' turn, with the
 * inner agents deciding for every seat (`SimAgents`, as in the turn planner's play-outs: the opponents are
 * always the stronger model), so what the formula guesses is played, and the value of a candidate is what the
 * board is worth then (`evaluate`).
 *
 * Which candidates: "no attack" (or "no block") and the best `LOOK_CANDIDATES` others, those within
 * `attacks.lookMargin` (`blocks.lookMargin`) of the best score so far. The rest keep their score of the
 * combat alone and are not compared with the looked-at ones. Two players only, as the deepening of the planner
 * (`heuristic-plan-deep.ts`): with more, one turn of each opponent costs what the budget allows.
 *
 * The look draws from the decision's work budget, after the search that found the candidates: it starts
 * another play-out only when the work so far plus the average cost of one fits (`Search.expired`), and a
 * decision that could not look at "no attack" and one other candidate keeps the choice of the search alone,
 * the crack-back formula included.
 */
import type { GameState, GameView, SeatId } from '@commander-arena/engine';
import { evaluate } from './evaluate';
import type { Budget } from './heuristic-budget';
import { type Line, type PlayContext, playLine, type SimAgents } from './heuristic-plan-sim';
import { PlanCounter } from './heuristic-plan-work';
import type { AgentWeights } from './weights';

/** How many candidates besides "no attack" (or "no block") are played to the next turn (a bound, not a weight). */
export const LOOK_CANDIDATES = 2;

/** What a decision's look did: how many play-outs it ran and whether it changed the search's choice. */
export interface LookRecord {
  readonly playOuts: number;
  readonly changed: boolean;
}

/** The agent's own decisions after the combat are today's rules: a line with nothing of its own. */
const CONTINUE: Line = { label: 'next turn', acts: {}, rest: {}, holdRemoval: [], reserve: null };

/** Whether the game has exactly two players still in it. */
export const twoPlayers = (view: GameView): boolean =>
  view.seats.filter((s) => !s.hasLost).length === 2;

/**
 * The view with the agent's own creatures untapped: they untap before they matter, and being tapped now is
 * paid for by the opponent's turn that was played, so the evaluator must not count it twice.
 */
export function untappedFor(view: GameView, me: SeatId): GameView {
  return {
    ...view,
    battlefield: view.battlefield.map((o) =>
      o.controller === me && o.tapped && o.types.includes('creature') ? { ...o, tapped: false } : o,
    ),
  };
}

/** Plays states of one decision on to the agent's next turn (see the module comment). */
export class Look {
  /** The play-outs started so far. */
  playOuts = 0;
  private readonly ctx: PlayContext;
  private readonly me: SeatId;

  constructor(me: SeatId, agents: SimAgents, budget: Budget, weights: AgentWeights) {
    this.me = me;
    this.ctx = { agents, budget, weights, work: new PlanCounter(budget.engine) };
  }

  /** The view at the start of the agent's next turn from `state`, or null when the play-out was dropped. */
  next(state: GameState): GameView | null {
    this.playOuts += 1;
    const played = playLine(state, this.me, CONTINUE, this.ctx, false);
    return played === null ? null : this.ctx.work.view(played.end, this.me);
  }

  /** The score of `view` for the agent, with its own creatures untapped. */
  score(view: GameView): number {
    return evaluate(untappedFor(view, this.me), this.me, this.ctx.weights).score;
  }
}

/**
 * The candidates to look at: `home` (always) and up to `LOOK_CANDIDATES` others of `ranked` (best first) whose
 * value is within `margin` of the best one's.
 */
export function lookSet<T>(
  ranked: readonly T[],
  home: T,
  value: (t: T) => number,
  margin: number,
): T[] {
  const best = ranked.reduce((m, t) => Math.max(m, value(t)), Number.NEGATIVE_INFINITY);
  const others = ranked
    .filter((t) => t !== home && value(t) >= best - margin)
    .slice(0, LOOK_CANDIDATES);
  return [home, ...others];
}

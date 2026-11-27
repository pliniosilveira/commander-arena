/**
 * What a play does to the board, measured on the determinized sample (the "spell delta"): the play is
 * applied to a copy through the engine's own `applyAction`, the copy is played on to the start of the next
 * turn, and `evaluate` scores it for the agent. The delta of a play is that score minus the score of
 * passing on the same sample. The engine decides what dies, what survives and what triggers, so no text
 * filter is needed to tell a good board wipe from a bad one. The real game is never touched
 * (`applyAction` is pure), a refused step drops the candidate (null) instead of guessing, and the decision's
 * budget (`Think.budget`, which counts these engine calls) stops the search: a play the search did not reach
 * is kept, as it was before.
 */
import type { Action, GameState, GameView, PendingDecision, SeatId } from '@commander-arena/engine';
import type { Play } from './casual-priority';
import { evaluate } from './evaluate';
import type { Engine, Think } from './heuristic-budget';
import { applyOrNull, playOut, within } from './heuristic-sim';

export type Answer = (view: GameView, pending: PendingDecision) => Action;

/**
 * Applies `first` for `me` on `state` and answers the follow-up questions of the same seat (targets, payment)
 * with `answer`, up to the next priority decision; null when the engine refuses a step.
 */
export function applyAnswering(
  state: GameState,
  me: SeatId,
  first: Action,
  answer: Answer,
  engine: Engine,
): GameState | null {
  let current = applyOrNull(state, me, first, engine);
  if (current === null) return null;
  for (let i = 0; i < 12; i += 1) {
    const pending = current.pending;
    if (pending === null || pending.seat !== me || pending.kind === 'priority') break;
    let next: GameState | null;
    try {
      next = applyOrNull(current, me, answer(engine.view(current, me), pending), engine);
    } catch {
      return null;
    }
    if (next === null) return null;
    current = next;
  }
  return current;
}

/** Casts `play` on the sample and plays the follow-up questions and the rest of the turn out; the score or null. */
export function scoreCast(
  sample: ReturnType<Think['sample']>,
  me: number,
  play: Action | null,
  answer: Answer,
  think: Pick<Think, 'budget' | 'weights'>,
): number | null {
  if (sample === undefined) return null;
  const engine = think.budget.engine;
  const state = play === null ? sample : applyAnswering(sample, me, play, answer, engine);
  if (state === null) return null;
  // Played on to the start of the next turn, so effects that last until end of turn (a pump) and marked
  // damage are gone and only what lasts is scored.
  const turn = sample.turn.number;
  const end = playOut(
    state,
    me,
    within(think.budget),
    (s) => s.result !== null || s.turn.number > turn,
    200,
  );
  return end === null ? null : evaluate(engine.view(end, me), me, think.weights).score;
}

/**
 * The plays of `ordered` (best first) that do not leave the board clearly worse than passing. A play is
 * dropped only when its delta is below `-main.deltaFloor` (`weights.ts`): `evaluate` does not count mana or what a card
 * draws later, so a play that is slightly negative on the board is kept. With no sample, no budget left
 * or a candidate the engine refuses, the play is kept as the plan made it.
 */
export function vetPlays(
  view: GameView,
  ordered: readonly Play[],
  think: Think,
  answer: Answer,
  castAction: (p: Play) => Action,
): Play[] {
  const sample = think.sample();
  if (sample === undefined || sample.pending?.kind !== 'priority') return [...ordered];
  const search = think.budget.search();
  const base = scoreCast(sample, view.viewer, null, answer, think);
  if (base === null) return [...ordered];
  const kept: Play[] = [];
  for (const [i, play] of ordered.entries()) {
    if (search.expired(i + 1) !== null) {
      kept.push(...ordered.slice(i));
      break;
    }
    const score = scoreCast(sample, view.viewer, castAction(play), answer, think);
    if (score === null || score - base >= -think.weights.main.deltaFloor) kept.push(play);
  }
  return kept;
}

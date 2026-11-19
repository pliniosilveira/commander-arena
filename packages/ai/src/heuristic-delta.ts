/**
 * What a play does to the board, measured on the determinized sample (the "spell delta"): the play is
 * applied to a copy through the engine's own `applyAction`, the copy is played on to the start of the next
 * turn, and `evaluate` scores it for the agent. The delta of a play is that score minus the score of
 * passing on the same sample. The engine decides what dies, what survives and what triggers, so no text
 * filter is needed to tell a good board wipe from a bad one. The real game is never touched
 * (`applyAction` is pure), a refused step drops the candidate (null) instead of guessing, and the budget
 * (`Think.budget`) stops the search: a play the search did not reach is kept, as it was before.
 */
import type { Action, GameView, PendingDecision } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';
import type { Play } from './casual-priority';
import { evaluate } from './evaluate';
import type { Think } from './heuristic-budget';
import { applyOrNull, playOut } from './heuristic-sim';

export type Answer = (view: GameView, pending: PendingDecision) => Action;

/** A play whose delta is below minus this is not made (score points; a card in hand is worth 1.2). */
export const DELTA_FLOOR = 0.5;

/** Casts `play` on the sample and plays the follow-up questions and the rest of the turn out; the score or null. */
export function scoreCast(
  sample: ReturnType<Think['sample']>,
  me: number,
  play: Action | null,
  answer: Answer,
  budget: Think['budget'],
): number | null {
  if (sample === undefined) return null;
  let state = sample;
  if (play !== null) {
    const cast = applyOrNull(state, me, play);
    if (cast === null) return null;
    state = cast;
    for (let i = 0; i < 12; i += 1) {
      const pending = state.pending;
      if (pending === null || pending.seat !== me || pending.kind === 'priority') break;
      let next: ReturnType<typeof applyOrNull>;
      try {
        next = applyOrNull(state, me, answer(getView(state, me), pending));
      } catch {
        return null;
      }
      if (next === null) return null;
      state = next;
    }
  }
  // Played on to the start of the next turn, so effects that last until end of turn (a pump) and marked
  // damage are gone and only what lasts is scored.
  const turn = sample.turn.number;
  const end = playOut(
    state,
    me,
    { abort: budget.over },
    (s) => s.result !== null || s.turn.number > turn,
    200,
  );
  return end === null ? null : evaluate(getView(end, me), me).score;
}

/**
 * The plays of `ordered` (best first) that do not leave the board clearly worse than passing. A play is
 * dropped only when its delta is below `-DELTA_FLOOR`: `evaluate` does not count mana or what a card
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
  const base = scoreCast(sample, view.viewer, null, answer, think.budget);
  if (base === null) return [...ordered];
  const kept: Play[] = [];
  for (const [i, play] of ordered.entries()) {
    if (think.budget.expired(i + 1)) {
      kept.push(...ordered.slice(i));
      break;
    }
    const score = scoreCast(sample, view.viewer, castAction(play), answer, think.budget);
    if (score === null || score - base >= -DELTA_FLOOR) kept.push(play);
  }
  return kept;
}

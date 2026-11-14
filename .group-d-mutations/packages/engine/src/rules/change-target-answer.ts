/**
 * The answer to the question of a "change the target" effect, "choose the new target" (CR 115.7a, D-181), apart from `rules/change-target.ts` because it
 * goes on with the resolution (`rules/stack.ts`), which the interpreter that runs the instruction cannot import (as for `rules/copy-spell-answer.ts`).
 */
import type { ChosenTarget } from '../state/chosen';
import type { GameState } from '../state/types';
import { withChangedTarget } from './change-target';
import { continueResolution, type ResolveOutcome } from './stack';
import { targetAnswerError } from './target-choice';

/**
 * The new target takes the place of the old one, and the resolution goes on. An error says why the target is not an answer; null when no such
 * question is waiting. The caller has checked that the seat is the one asked.
 */
export function answerChangedTarget(
  state: GameState,
  chosen: readonly ChosenTarget[],
): ResolveOutcome | { readonly error: string } | null {
  const res = state.resolution;
  const head = res?.queue[0];
  const pending = state.pending;
  if (res === null || head?.kind !== 'changeTarget') return null;
  if (pending?.kind !== 'targets' || pending.forChange !== true) return null;
  const refused = targetAnswerError(pending, chosen);
  if (refused !== null) return { error: refused };
  const subject = state.objects[head.object];
  const to = chosen[0];
  if (subject === undefined || to === undefined) return null;
  const changed = withChangedTarget({ ...state, pending: null }, res.controller, subject, to);
  return continueResolution(
    { ...changed.state, resolution: { ...res, queue: res.queue.slice(1) } },
    changed.events,
  );
}

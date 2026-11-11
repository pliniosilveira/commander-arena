/**
 * The answer to the question of a copy of a spell, "choose new targets for the copy" (CR 707.10c, D-129), apart from
 * `rules/copy-spell.ts` because it goes on with the resolution (`rules/stack.ts`), which the interpreter that runs the
 * instruction cannot import (as for `rules/cast-exiled-answer.ts`).
 */
import type { ChosenTarget } from '../state/chosen';
import type { TargetsDecision } from '../state/decisions';
import { patchObject } from '../state/ops';
import type { GameState, Instruction } from '../state/types';
import { becameTargetEvents } from './becomes-target';
import { sameTarget } from './select';
import { continueResolution, type ResolveOutcome } from './stack';
import { targetAnswerError } from './target-choice';

/**
 * CR 707.10, 115.7f (D-149): the copy of a spell that divides something keeps the original division. In a slot that `keepsDivision`, a target that
 * the copy already had keeps its own share, and each new target, in the order the answer names them, takes the share of a target the answer
 * dropped, in the order of the original targets. The answer has as many targets as the original, so the shares given out are exactly the original's.
 */
function keepShares(
  pending: TargetsDecision,
  original: readonly ChosenTarget[],
  chosen: readonly ChosenTarget[],
): readonly ChosenTarget[] {
  const kept = new Set(pending.specs.filter((s) => s.keepsDivision === true).map((s) => s.specId));
  if (kept.size === 0) return chosen;
  const dropped = new Map<string, number[]>();
  for (const specId of kept) {
    const was = original.filter((t) => t.specId === specId);
    const now = chosen.filter((t) => t.specId === specId);
    dropped.set(
      specId,
      was.filter((t) => !now.some((n) => sameTarget(n, t))).map((t) => t.share ?? 1),
    );
  }
  return chosen.map((t) => {
    if (!kept.has(t.specId)) return t;
    const own = original.find((o) => o.specId === t.specId && sameTarget(o, t));
    const share = own === undefined ? dropped.get(t.specId)?.shift() : own.share;
    return share === undefined ? t : { ...t, share };
  });
}

/**
 * The answer to the question of `askTargets` (CR 707.10c): the copy takes the targets, the events of becoming a target
 * follow, and the resolution makes the next copy. An error says why the targets are not an answer; null when no such
 * question is waiting. The caller has checked that the seat is the one asked.
 */
export function answerCopyTargets(
  state: GameState,
  chosen: readonly ChosenTarget[],
): ResolveOutcome | { readonly error: string } | null {
  const res = state.resolution;
  const head = res?.queue[0];
  const pending = state.pending;
  if (res === null || head?.kind !== 'copySpell' || head.stage !== 'targets') return null;
  if (pending?.kind !== 'targets' || pending.forCopy !== true || head.copy === null) return null;
  const refused = targetAnswerError(pending, chosen);
  if (refused !== null) return { error: refused };
  const copy = state.objects[head.copy];
  if (copy?.stack == null) return null;
  const kept = keepShares(pending, copy.stack.chosenTargets, chosen);
  const next = patchObject({ ...state, pending: null }, copy.id, {
    stack: { ...copy.stack, chosenTargets: kept },
  });
  const events = becameTargetEvents(next, copy.id, res.controller);
  const after: Instruction = {
    ...head,
    count: head.count - 1,
    stage: 'make',
    copy: null,
  };
  return continueResolution(
    { ...next, resolution: { ...res, queue: [after, ...res.queue.slice(1)] } },
    events,
  );
}

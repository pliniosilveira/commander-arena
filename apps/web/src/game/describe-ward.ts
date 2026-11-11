/**
 * "Counter it unless its controller pays" in the game log: Ward (CR 702.21a) and "Counter target
 * spell unless its controller pays {3}" (D-092, D-096) share one engine path, so one set of
 * helpers words both. The question and the payment have no event of their own that names the
 * spell, so their lines are worded from the decision that was pending before the action, as the
 * shock-land and kicker lines are. Pure functions of the state, tested through `describeEvent`.
 */
import type { GameState, ObjectId, PendingDecision } from '@commander-arena/engine';

export type UnlessQuestion = Extract<PendingDecision, { kind: 'confirmOptional' }>;
export type UnlessPayment = Extract<PendingDecision, { kind: 'payMana' }>;

/**
 * The purposes that ask "pay or it is countered" (the same question for Ward and a counterspell) and
 * "pay or [the effect] happens" (`unlessPays`, D-111: the same flow, a different consequence).
 */
export function isUnlessPurpose(
  purpose: string | undefined,
): purpose is 'ward' | 'counterUnlessPays' | 'unlessPays' {
  return purpose === 'ward' || purpose === 'counterUnlessPays' || purpose === 'unlessPays';
}

/** The question that `before` was waiting on, when it is the one `source` (the ability) asked. */
export function unlessQuestion(before: GameState, source: ObjectId): UnlessQuestion | null {
  const asked = before.pending;
  return asked?.kind === 'confirmOptional' &&
    isUnlessPurpose(asked.purpose) &&
    asked.source === source
    ? asked
    : null;
}

/** The payment that `before` was waiting on, when `subject` is the spell it would counter. */
export function unlessPayment(before: GameState, subject: ObjectId): UnlessPayment | null {
  const asked = before.pending;
  return asked?.kind === 'payMana' && isUnlessPurpose(asked.purpose) && asked.subject === subject
    ? asked
    : null;
}

/**
 * True when the `countered` event of `subject` came from declining the question: the line of the
 * answer ("You don't pay; X is countered.") already says so, and a second line would repeat it.
 */
export function counteredByDeclining(before: GameState, subject: ObjectId): boolean {
  const asked = before.pending;
  return (
    asked?.kind === 'confirmOptional' && isUnlessPurpose(asked.purpose) && asked.subject === subject
  );
}

/**
 * Dividing combat damage (CR 510.1, 702.19b): the steppers' arithmetic and the same lethal-first
 * check the engine makes, so the player sees why a division is refused before sending it. The
 * engine stays the judge; these helpers only give hints and keep the sums honest.
 */
import type {
  DamageAssignment,
  DamageChoice,
  DamageRecipient,
  ObjectId,
} from '@commander-arena/engine';
import { sameRecipient } from './lookup';

export interface RecipientRow {
  readonly to: DamageRecipient;
  /** Damage that counts as lethal to this blocker, or null for the trample recipient. */
  readonly lethal: number | null;
}

/** Every place this creature's damage may go: its blockers in order, then the trample recipient. */
export function recipientsOf(choice: DamageChoice): readonly RecipientRow[] {
  const rows: RecipientRow[] = choice.blockers.map((b) => ({
    to: { kind: 'object', id: b.object },
    lethal: b.lethal,
  }));
  if (choice.tramplesOver !== null) rows.push({ to: choice.tramplesOver, lethal: null });
  return rows;
}

export function amountTo(
  assignments: readonly DamageAssignment[],
  source: ObjectId,
  to: DamageRecipient,
): number {
  return assignments
    .filter((a) => a.source === source && sameRecipient(a.to, to))
    .reduce((sum, a) => sum + a.amount, 0);
}

export function assignedBy(assignments: readonly DamageAssignment[], source: ObjectId): number {
  return assignments.filter((a) => a.source === source).reduce((sum, a) => sum + a.amount, 0);
}

export function remainingFor(
  choice: DamageChoice,
  assignments: readonly DamageAssignment[],
): number {
  return choice.power - assignedBy(assignments, choice.source);
}

/** Sets one amount (never below zero, never past the creature's power) and drops empty entries. */
export function setAmount(
  assignments: readonly DamageAssignment[],
  choice: DamageChoice,
  to: DamageRecipient,
  amount: number,
): readonly DamageAssignment[] {
  const others = assignments.filter(
    (a) => !(a.source === choice.source && sameRecipient(a.to, to)),
  );
  const room = choice.power - assignedBy(others, choice.source);
  const clamped = Math.max(0, Math.min(Math.trunc(amount), room));
  return clamped === 0 ? others : [...others, { source: choice.source, to, amount: clamped }];
}

export function bump(
  assignments: readonly DamageAssignment[],
  choice: DamageChoice,
  to: DamageRecipient,
  delta: number,
): readonly DamageAssignment[] {
  return setAmount(assignments, choice, to, amountTo(assignments, choice.source, to) + delta);
}

/** CR 702.19b: excess may go past the blockers only once every blocker has lethal damage. */
export function trampleHint(
  choice: DamageChoice,
  assignments: readonly DamageAssignment[],
): string | null {
  if (choice.tramplesOver === null) return null;
  const over = amountTo(assignments, choice.source, choice.tramplesOver);
  if (over === 0) return null;
  const short = choice.blockers.some(
    (b) => amountTo(assignments, choice.source, { kind: 'object', id: b.object }) < b.lethal,
  );
  return short ? 'Assign lethal damage to every blocker before trampling over.' : null;
}

/** True when every creature has divided all its power (the engine then checks the rules). */
export function divisionComplete(
  choices: readonly DamageChoice[],
  assignments: readonly DamageAssignment[],
): boolean {
  return choices.every((c) => remainingFor(c, assignments) === 0);
}

export function divisionHints(
  choices: readonly DamageChoice[],
  assignments: readonly DamageAssignment[],
): readonly string[] {
  return choices.flatMap((c) => {
    const hint = trampleHint(c, assignments);
    return hint === null ? [] : [hint];
  });
}

/**
 * A copy of a spell that divides damage keeps the original division (CR 707.10, 115.7f, D-149): the question for new targets has as
 * many targets as the original (`TargetChoiceSpec.keepsDivision`, `min` = `max`), no share to name, and a new target takes the
 * share of the one it replaces. These words show the shares of `current`, read only; the panel never asks for a division (the engine
 * refuses an answer that names a share). Pure.
 */
import type { ChosenTarget, SeatId, TargetsDecision } from '@commander-arena/engine';
import { type Index, nameOf, seatLabel } from './lookup';

/** True when some slot of the question keeps the original division. */
export function keepsDivision(decision: Pick<TargetsDecision, 'specs'>): boolean {
  return decision.specs.some((s) => s.keepsDivision === true);
}

/** The targets the copy has now in the slots that keep their division, in order, each with the share it has. */
export function keptTargets(
  decision: Pick<TargetsDecision, 'specs' | 'current'>,
): readonly (ChosenTarget & { readonly share: number })[] {
  const kept = new Set(decision.specs.filter((s) => s.keepsDivision === true).map((s) => s.specId));
  return (decision.current ?? []).flatMap((t) =>
    kept.has(t.specId) && t.share !== undefined ? [{ ...t, share: t.share }] : [],
  );
}

/** "Grizzly Bears 2": a target of the original with its share. */
export function shareLabel(
  target: ChosenTarget & { readonly share: number },
  index: Index,
  viewer: SeatId,
): string {
  const name = target.kind === 'object' ? nameOf(index, target.id) : seatLabel(target.seat, viewer);
  return `${name} ${target.share}`;
}

/**
 * "The original division stays: Grizzly Bears 2, Opponent 1. A new target takes the share of the one it replaces." Null for a
 * question that keeps no division.
 */
export function keptDivisionText(
  decision: Pick<TargetsDecision, 'specs' | 'current'>,
  index: Index,
  viewer: SeatId,
): string | null {
  if (!keepsDivision(decision)) return null;
  const shares = keptTargets(decision).map((t) => shareLabel(t, index, viewer));
  const original = shares.length === 0 ? '' : `: ${shares.join(', ')}`;
  return `The original division stays${original}. A new target takes the share of the one it replaces.`;
}

/**
 * Dividing damage among the targets of a spell (CR 601.2d, D-145): "deals X damage divided as you choose among any number of
 * target creatures". The engine asks the division together with the targets: each chosen target of a slot that divides carries a
 * `share` of at least 1 and the shares add up to the total (`TargetChoiceSpec.divide`). These are the pure parts of the
 * steppers on the targets panel: the even split a new choice starts with, one step up or down, what is left to assign and
 * whether the division is complete. The engine stays the judge; these only keep the sums honest and say why a division is refused.
 */
import type { ChosenTarget, TargetChoiceSpec } from '@commander-arena/engine';

/** The same object or player (not necessarily the same slot); `targeting.ts` has the same test, and imports this module. */
const sameTarget = (a: ChosenTarget, b: ChosenTarget): boolean =>
  a.kind === 'object'
    ? b.kind === 'object' && a.id === b.id
    : b.kind === 'player' && a.seat === b.seat;

/** The total the slot `specId` divides, or null for a slot that divides nothing. */
export function divideTotal(specs: readonly TargetChoiceSpec[], specId: string): number | null {
  return specs.find((s) => s.specId === specId)?.divide ?? null;
}

/** The slots that divide something. */
export function dividedSpecs(specs: readonly TargetChoiceSpec[]): readonly TargetChoiceSpec[] {
  return specs.filter((s) => s.divide !== undefined);
}

/**
 * `total` shared out as evenly as whole numbers allow, the larger shares first ("5 among 2" is 3 and 2). Every share is at
 * least 1: more targets than the total (which the engine never offers) gives each one.
 */
export function evenShares(total: number, count: number): readonly number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => Math.max(1, base + (i < extra ? 1 : 0)));
}

/**
 * The picks with the shares of every slot that divides set to the even split among the targets chosen for it, in the order they
 * were picked. Picks of other slots are untouched, and the same array comes back when nothing divides. Called whenever the set
 * of targets changes: a new target, or one taken back, starts the division over (the steppers then adjust it).
 */
export function withEvenShares(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
): readonly ChosenTarget[] {
  const divided = dividedSpecs(specs);
  if (divided.length === 0) return picks;
  let result = picks;
  for (const spec of divided) {
    const total = spec.divide;
    if (total === undefined) continue;
    const mine = result.filter((p) => p.specId === spec.specId);
    const shares = evenShares(total, mine.length);
    result = result.map((p) => {
      const at = mine.indexOf(p);
      const share = at < 0 ? undefined : shares[at];
      return share === undefined ? p : { ...p, share };
    });
  }
  return result;
}

/** The share a chosen target has now (0 when it is not chosen for the slot, or carries none). */
export function shareOf(
  picks: readonly ChosenTarget[],
  target: ChosenTarget,
  specId: string,
): number {
  const found = picks.find((p) => p.specId === specId && sameTarget(p, target));
  return found?.share ?? 0;
}

/** The sum of the shares chosen for the slot. */
function sharesGiven(picks: readonly ChosenTarget[], specId: string): number {
  return picks.filter((p) => p.specId === specId).reduce((sum, p) => sum + (p.share ?? 0), 0);
}

/** What is not yet given to a target of the slot: the total less the shares chosen (never below 0). */
export function sharesLeft(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
  specId: string,
): number {
  const total = divideTotal(specs, specId);
  return total === null ? 0 : Math.max(0, total - sharesGiven(picks, specId));
}

/**
 * One step on a target's share: never below 1 (a target that is chosen gets damage; take it back to remove it) and never past
 * what is left to assign. The same array comes back when the step changes nothing.
 */
export function bumpShare(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
  target: ChosenTarget,
  specId: string,
  delta: number,
): readonly ChosenTarget[] {
  const now = shareOf(picks, target, specId);
  if (now === 0) return picks;
  const next = Math.max(1, Math.min(now + delta, now + sharesLeft(specs, picks, specId)));
  if (next === now) return picks;
  return picks.map((p) =>
    p.specId === specId && sameTarget(p, target) ? { ...p, share: next } : p,
  );
}

/** The shares sum to the total of every slot that divides (a slot with no target chosen has nothing to divide). */
export function divisionComplete(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
): boolean {
  return dividedSpecs(specs).every((spec) => {
    const chosen = picks.filter((p) => p.specId === spec.specId);
    return chosen.length === 0 || sharesGiven(picks, spec.specId) === spec.divide;
  });
}

/** Why Confirm is disabled for the division (its tooltip), or null when every slot is complete. */
export function divisionHint(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
): string | null {
  for (const spec of dividedSpecs(specs)) {
    const left = sharesLeft(specs, picks, spec.specId);
    if (picks.some((p) => p.specId === spec.specId) && left > 0) {
      return `${left} damage left to assign`;
    }
  }
  return null;
}

/** "3 left to assign", "All 5 damage assigned": the line under the steppers. */
export function divisionLine(total: number, left: number): string {
  return left === 0 ? `All ${total} damage assigned.` : `${left} left to assign.`;
}

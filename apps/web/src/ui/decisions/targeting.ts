/**
 * Targeting mode (CR 601.2c): a click picks a legal target for the first slot that still has room
 * for it; a click on a chosen target takes it back. Pure, so the slot rules are unit tested.
 */
import type { ChosenTarget, ObjectId, SeatId, TargetChoiceSpec } from '@commander-arena/engine';
import { divisionComplete, withEvenShares } from './divide';

export function sameTarget(a: ChosenTarget, b: ChosenTarget): boolean {
  return a.kind === 'object'
    ? b.kind === 'object' && a.id === b.id
    : b.kind === 'player' && a.seat === b.seat;
}

export interface SlotStatus {
  readonly spec: TargetChoiceSpec;
  readonly count: number;
  readonly full: boolean;
  /** At least `min` and at most `max` targets are chosen. */
  readonly ok: boolean;
}

export function slotStatuses(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
): readonly SlotStatus[] {
  return specs.map((spec) => {
    const count = picks.filter((p) => p.specId === spec.specId).length;
    return { spec, count, full: count >= spec.max, ok: count >= spec.min && count <= spec.max };
  });
}

/** The slot being filled now: the first one that is not yet full (and not yet at its minimum first). */
export function currentSlot(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
): SlotStatus | null {
  const slots = slotStatuses(specs, picks);
  return slots.find((s) => s.count < s.spec.min) ?? slots.find((s) => !s.full) ?? null;
}

export function targetsReady(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
): boolean {
  // D-145 (CR 601.2d): a slot that divides damage is ready only when the shares add up to the total.
  return slotStatuses(specs, picks).every((s) => s.ok) && divisionComplete(specs, picks);
}

/**
 * Toggles a target: removes it if chosen, else adds it to the first open slot where it is legal. With
 * `specId` (a chip under a mode's heading) only that slot is considered, for adding and for removing,
 * so the same creature can be the target of two modes (CR 601.2c, 700.2c).
 */
export function toggleTarget(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
  target: ChosenTarget,
  specId?: string,
): readonly ChosenTarget[] {
  const here = (p: ChosenTarget) =>
    sameTarget(p, target) && (specId === undefined || p.specId === specId);
  // D-145 (CR 601.2d): a change of the targets of a slot that divides damage starts its division over, evenly.
  if (picks.some(here))
    return withEvenShares(
      specs,
      picks.filter((p) => !here(p)),
    );
  // D-149 (TargetSpec.onePerOpponent): a slot takes one target for each player who controls them; a second target of the same
  // player's takes the place of the first, as a click on the one that is chosen takes it back.
  const swapped = swapSameGroup(specs, picks, target, specId);
  if (swapped !== null) return withEvenShares(specs, swapped);
  const open = slotStatuses(specs, picks).find(
    (s) =>
      !s.full &&
      (specId === undefined || s.spec.specId === specId) &&
      s.spec.legal.some((l) => sameTarget(l, target)) &&
      !repeatsOtherSlot(specs, picks, s.spec, target),
  );
  if (open === undefined) return picks;
  const chosen: ChosenTarget =
    target.kind === 'object'
      ? { kind: 'object', id: target.id, specId: open.spec.specId }
      : { kind: 'player', seat: target.seat, specId: open.spec.specId };
  return withEvenShares(specs, [...picks, chosen]);
}

/**
 * True when `target` may not go into `spec` because the slots must differ (D-151, `TargetChoiceSpec.differentFrom`, CR 115.3: "each of up
 * to two other targets"): it is chosen in the slot `spec` has to differ from, or `spec` is that slot and it is chosen in a slot that must
 * differ from it. The engine refuses the answer either way; the page does not offer it.
 */
export function repeatsOtherSlot(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
  spec: TargetChoiceSpec,
  target: ChosenTarget,
): boolean {
  const chosenIn = (specId: string) =>
    picks.some((p) => p.specId === specId && sameTarget(p, target));
  if (spec.differentFrom !== undefined && chosenIn(spec.differentFrom)) return true;
  return specs.some((other) => other.differentFrom === spec.specId && chosenIn(other.specId));
}

/** The player who controls `target`, read from the legal list of the slot (the engine puts it there); undefined for a player or no group. */
export function groupOf(spec: TargetChoiceSpec, target: ChosenTarget): SeatId | undefined {
  if (target.kind !== 'object') return undefined;
  const found = spec.legal.find((l) => sameTarget(l, target));
  return found?.kind === 'object' ? found.group : undefined;
}

/**
 * The picks with `target` in place of the target of the same group already chosen in a slot that takes one target for each group
 * (`onePerGroup`); null when no such slot is involved, or no target of that group is chosen yet.
 */
function swapSameGroup(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
  target: ChosenTarget,
  specId: string | undefined,
): readonly ChosenTarget[] | null {
  for (const spec of specs) {
    if (spec.onePerGroup !== true || (specId !== undefined && spec.specId !== specId)) continue;
    const group = groupOf(spec, target);
    if (group === undefined) continue;
    const same = picks.find((p) => p.specId === spec.specId && groupOf(spec, p) === group);
    if (same === undefined) continue;
    const chosen: ChosenTarget =
      target.kind === 'object'
        ? { kind: 'object', id: target.id, specId: spec.specId }
        : { kind: 'player', seat: target.seat, specId: spec.specId };
    return picks.map((p) => (p === same ? chosen : p));
  }
  return null;
}

/** True when `target` is picked for the slot `specId`. */
export function pickedFor(
  picks: readonly ChosenTarget[],
  target: ChosenTarget,
  specId: string,
): boolean {
  return picks.some((p) => sameTarget(p, target) && p.specId === specId);
}

/**
 * The targets as the answer carries them: with a copy of a divided spell (`keepsDivision`, D-149, CR 707.10, 115.7f) the division is
 * the original's and the answer names no share (the engine refuses one), so the shares the starting choice had are dropped.
 */
export function answerTargets(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
): readonly ChosenTarget[] {
  const kept = new Set(specs.filter((s) => s.keepsDivision === true).map((s) => s.specId));
  if (kept.size === 0) return picks;
  return picks.map((p) => {
    if (!kept.has(p.specId) || p.share === undefined) return p;
    const { share: _share, ...rest } = p;
    return rest;
  });
}

/**
 * Which time a slot's mode is chosen (D-344, CR 700.2d): 1 for the first, 2 for the second; null when the mode is chosen once, which is
 * every mode of a spell that does not repeat modes. Every time has slots of its own.
 */
export function modeTime(
  specs: readonly TargetChoiceSpec[],
  spec: TargetChoiceSpec,
): number | null {
  const repeated = specs.some((s) => s.mode === spec.mode && s.instance !== undefined);
  return repeated ? (spec.instance ?? 0) + 1 : null;
}

/**
 * The slots grouped by the mode they belong to, in order; null for a decision that is not modal. A mode chosen more than once (D-344, CR 700.2d)
 * has a group for each time (`time` 1, 2, ...), each with slots of its own; `time` is null for a mode chosen once.
 */
export function modeGroups(specs: readonly TargetChoiceSpec[]):
  | readonly {
      readonly mode: number;
      readonly time: number | null;
      readonly specs: readonly TargetChoiceSpec[];
    }[]
  | null {
  if (!specs.some((s) => s.mode !== undefined)) return null;
  const groups: { mode: number; time: number | null; specs: TargetChoiceSpec[] }[] = [];
  for (const spec of specs) {
    if (spec.mode === undefined) continue;
    const time = modeTime(specs, spec);
    const group = groups.find((g) => g.mode === spec.mode && g.time === time);
    if (group === undefined) groups.push({ mode: spec.mode, time, specs: [spec] });
    else group.specs.push(spec);
  }
  return groups;
}

/** What can be clicked now: legal targets of slots with room, plus chosen ones (to take back). */
export function clickableTargets(
  specs: readonly TargetChoiceSpec[],
  picks: readonly ChosenTarget[],
): { readonly objects: ReadonlySet<ObjectId>; readonly seats: ReadonlySet<SeatId> } {
  const objects = new Set<ObjectId>();
  const seats = new Set<SeatId>();
  const add = (t: ChosenTarget) => {
    if (t.kind === 'object') objects.add(t.id);
    else seats.add(t.seat);
  };
  // A slot that takes one target for each player stays open to a swap (D-149).
  for (const s of slotStatuses(specs, picks)) {
    if (!s.full || s.spec.onePerGroup === true) s.spec.legal.forEach(add);
  }
  picks.forEach(add);
  return { objects, seats };
}

export function chosenObjects(picks: readonly ChosenTarget[]): ReadonlySet<ObjectId> {
  return new Set(picks.flatMap((p) => (p.kind === 'object' ? [p.id] : [])));
}

export function chosenSeats(picks: readonly ChosenTarget[]): ReadonlySet<SeatId> {
  return new Set(picks.flatMap((p) => (p.kind === 'player' ? [p.seat] : [])));
}

/** Every distinct legal target across all slots, for the list that reaches objects off the board. */
export function allLegalTargets(specs: readonly TargetChoiceSpec[]): readonly ChosenTarget[] {
  const out: ChosenTarget[] = [];
  for (const spec of specs)
    for (const t of spec.legal) if (!out.some((o) => sameTarget(o, t))) out.push(t);
  return out;
}

/**
 * True when `picks` are exactly the targets `current` (the same objects and players in the same slots),
 * in any order: the answer that keeps the targets a copy of a spell has (CR 707.10c, D-129).
 */
export function sameTargets(
  picks: readonly ChosenTarget[],
  current: readonly ChosenTarget[],
): boolean {
  return (
    picks.length === current.length &&
    current.every((c) => picks.some((p) => p.specId === c.specId && sameTarget(p, c)))
  );
}

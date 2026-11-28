/**
 * "Another target" (CR 115.3, 601.2c, issue 638): whether the slots of a spell or ability that must not share a target can all be filled together.
 *
 * A slot that differs from an earlier one (`differentFrom`, `alsoDifferentFrom`) may have legal targets of its own and the earlier slot may have its
 * own, and still no legal choice exist: Saheeli, Sublime Artificer's "target artifact you control becomes a copy of another target artifact or creature
 * you control" with one artifact only, which fits both slots alone. Counting each slot's legal targets on its own (`slotCanBeFilled`) offers such a spell
 * or ability, and the targets decision that follows has no answer; the player who cannot choose the targets cannot cast or activate it (CR 601.2,
 * 602.2: the casting or activation is illegal and rewound), so it is not offered.
 */
import type { TargetSpec } from '../ast/types';
import type { ChosenTarget } from '../state/chosen';
import { targetBounds } from './select';

/** Assignments tried at most before the answer is left to the targets decision (the old answer, true): a bound on a pathological board. */
const MAX_STEPS = 10_000;

const keyOf = (t: ChosenTarget): string =>
  t.kind === 'object' ? `o:${t.id}` : `p:${String(t.seat)}`;

/**
 * Whether every slot can get at least its minimum of legal targets with no target shared by two slots that must differ (CR 115.3). `legalOf` gives
 * each slot's legal targets (the caller's own list: a slot narrowed by a conditional flash, D-408). True when no slot says "another".
 */
export function differentTargetsFillable(
  specs: readonly TargetSpec[],
  legalOf: (spec: TargetSpec, index: number) => readonly ChosenTarget[],
): boolean {
  const ids = new Set(specs.map((s) => s.id));
  // The pairs of slots that must not share a target, both of them in this list, both needing a target (a slot that may take none is no obstacle).
  const needs = new Map(specs.map((s) => [s.id, targetBounds(s).min] as const));
  const differs = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!ids.has(a) || !ids.has(b) || a === b) return;
    if ((needs.get(a) ?? 0) === 0 || (needs.get(b) ?? 0) === 0) return;
    differs.set(a, (differs.get(a) ?? new Set()).add(b));
    differs.set(b, (differs.get(b) ?? new Set()).add(a));
  };
  for (const spec of specs) {
    for (const other of [
      ...(spec.differentFrom === undefined ? [] : [spec.differentFrom]),
      ...(spec.alsoDifferentFrom ?? []),
    ]) {
      link(spec.id, other);
    }
  }
  if (differs.size === 0) return true;
  // The slots that take part, the scarcest first (a failure is found sooner).
  const slots = specs
    .map((spec, index) => ({
      id: spec.id,
      min: needs.get(spec.id) ?? 0,
      legal: [...new Set(legalOf(spec, index).map(keyOf))],
    }))
    .filter((s) => differs.has(s.id))
    .sort((a, b) => a.legal.length - b.legal.length);
  const taken = new Map<string, ReadonlySet<string>>();
  let steps = 0;
  let exhausted = false;
  const fill = (i: number): boolean => {
    const slot = slots[i];
    if (slot === undefined) return true;
    const blocked = new Set<string>();
    for (const other of differs.get(slot.id) ?? []) {
      for (const k of taken.get(other) ?? []) blocked.add(k);
    }
    const open = slot.legal.filter((k) => !blocked.has(k));
    if (open.length < slot.min) return false;
    // Every choice of `min` of the open targets, in order, until the later slots can be filled too.
    const pick = (from: number, chosen: string[]): boolean => {
      if (exhausted) return true;
      if (chosen.length === slot.min) {
        steps += 1;
        if (steps > MAX_STEPS) {
          exhausted = true;
          return true;
        }
        taken.set(slot.id, new Set(chosen));
        const ok = fill(i + 1);
        taken.delete(slot.id);
        return ok;
      }
      for (let j = from; j <= open.length - (slot.min - chosen.length); j += 1) {
        if (pick(j + 1, [...chosen, open[j] as string])) return true;
      }
      return false;
    };
    return pick(0, []);
  };
  return fill(0);
}

/**
 * Whether every slot has at least its minimum of legal targets (CR 601.2c), read slot by slot until one has too few, and the slots that must differ can
 * be filled together (`differentTargetsFillable`). Each slot's legal targets are read once.
 */
export function targetSlotsFillable(
  specs: readonly TargetSpec[],
  legalOf: (spec: TargetSpec) => readonly ChosenTarget[],
): boolean {
  const legal: (readonly ChosenTarget[])[] = [];
  for (const spec of specs) {
    const found = legalOf(spec);
    if (found.length < targetBounds(spec).min) return false;
    legal.push(found);
  }
  return differentTargetsFillable(specs, (_, i) => legal[i] ?? []);
}

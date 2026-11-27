/**
 * "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors." (Hazel of the Rootbloom; CR 107.3, 106.1b, 605.3b): the player chooses X as the
 * ability is activated by choosing the permanents to tap, and a color for each mana. The engine lists one option that taps every candidate (`PriorityOption.tappedMany`) and accepts any
 * other X and mix, so a click on the source opens a small form (`TapManyPopover`) built on these pure rules.
 */
import type { Action, ManaColor, ObjectId, PriorityDecision } from '@commander-arena/engine';

/** The five colors of mana, in the order of the game (W, U, B, R, G): "any combination of colors" never makes colorless (CR 106.1b). */
export const FIVE_COLORS: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

/** What a click on a source with the ability asks: which ability, and the permanents the player may tap. */
export interface TapManyAsk {
  readonly source: ObjectId;
  readonly abilityIndex: number;
  /** Every untapped permanent the cost may tap, in the engine's order. */
  readonly candidates: readonly ObjectId[];
}

/** The ability of `id` that taps X permanents, as the priority options list it (one option taps all of them), or null. */
export function tapManyOf(decision: PriorityDecision, id: ObjectId): TapManyAsk | null {
  for (const o of decision.options) {
    if (o.kind === 'activateAbility' && o.source === id && o.tappedMany !== undefined) {
      return { source: id, abilityIndex: o.abilityIndex, candidates: o.tappedMany };
    }
  }
  return null;
}

/** How many mana of each color the player chose. */
export type ColorCounts = Readonly<Record<ManaColor, number>>;

export const NO_COLORS: ColorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

export const totalOf = (counts: ColorCounts): number =>
  FIVE_COLORS.reduce((n, c) => n + counts[c], 0);

/** One more (`step` 1) or one less (`step` -1) mana of `color`, never below 0 and never more than `limit` in all. */
export function stepColor(
  counts: ColorCounts,
  color: ManaColor,
  step: 1 | -1,
  limit: number,
): ColorCounts {
  const next = counts[color] + step;
  if (next < 0 || (step === 1 && totalOf(counts) >= limit)) return counts;
  return { ...counts, [color]: next };
}

/** All `limit` mana of one color. */
export const allOf = (color: ManaColor, limit: number): ColorCounts => ({
  ...NO_COLORS,
  [color]: limit,
});

/** The counts cut back to `limit` mana in all: when the player taps fewer permanents the colors that no longer fit are taken off, the last colors first. */
export function trimTo(counts: ColorCounts, limit: number): ColorCounts {
  let over = totalOf(counts) - limit;
  if (over <= 0) return counts;
  const next: Record<ManaColor, number> = { ...counts };
  for (const color of [...FIVE_COLORS].reverse()) {
    const take = Math.min(over, next[color]);
    next[color] -= take;
    over -= take;
  }
  return next;
}

/** The permanents ticked or unticked: `picked` in the order of `candidates`. */
export function togglePicked(
  candidates: readonly ObjectId[],
  picked: readonly ObjectId[],
  id: ObjectId,
): ObjectId[] {
  const on = new Set(picked);
  if (on.has(id)) on.delete(id);
  else on.add(id);
  return candidates.filter((c) => on.has(c));
}

/**
 * The action of the form: the picked permanents and one color for each, or null while the colors chosen are not as many as the permanents (the engine would refuse it). X may be 0
 * (CR 107.3): both lists are then empty.
 */
export function tapManyAction(
  ask: TapManyAsk,
  picked: readonly ObjectId[],
  counts: ColorCounts,
): Extract<Action, { kind: 'activateAbility' }> | null {
  if (totalOf(counts) !== picked.length) return null;
  const combination = FIVE_COLORS.flatMap((c) => Array.from({ length: counts[c] }, () => c));
  return {
    kind: 'activateAbility',
    source: ask.source,
    abilityIndex: ask.abilityIndex,
    color: null,
    combination,
    tappedMany: [...picked],
  };
}

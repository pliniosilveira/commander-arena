/**
 * Choosing targets (CR 601.2c, 602.2b, 603.3d): what a spell, an activated ability and a triggered
 * ability all ask, and how the answer is checked. The three paths differ in what comes next (the
 * cost, or the stack), not in the choice, so the decision and its check live here.
 */
import type { TargetSpec } from '../ast/types';
import type { ChosenTarget } from '../state/chosen';
import type { TargetChoiceSpec, TargetsDecision } from '../state/decisions';
import type { GameState } from '../state/types';
import { amountOf } from './amounts';
import type { SlotMode } from './modes';
import { legalTargets, type SelectContext, sameTarget, targetBounds } from './select';

/**
 * What the caster divides among the targets of this slot, read now, as the spell is cast (CR 601.2d, D-145), or null when the slot divides
 * nothing. A negative amount is nothing to divide (CR 107.1b).
 */
export function divideTotal(state: GameState, spec: TargetSpec, ctx: SelectContext): number | null {
  return spec.divide === undefined
    ? null
    : Math.max(0, amountOf(state, spec.divide.total, ctx, []));
}

/**
 * Whether the slot can be filled as the spell is cast: enough legal targets for its minimum and, when it divides something, a total with at
 * least 1 for each of them (CR 601.2c, 601.2d).
 */
export function slotCanBeFilled(state: GameState, spec: TargetSpec, ctx: SelectContext): boolean {
  const { min } = targetBounds(spec);
  if (legalTargets(state, spec, ctx).length < min) return false;
  const total = divideTotal(state, spec, ctx);
  return total === null || total >= min;
}

/**
 * The slots of a `targets` decision for these specs: bounds and every legal target (CR 115, 601.2c).
 * `modeOf` (D-114, D-1000) says which mode of a modal spell or ability each slot belongs to, and which instance of it.
 */
export function targetChoiceSpecs(
  state: GameState,
  specs: readonly TargetSpec[],
  ctx: SelectContext,
  modeOf?: ReadonlyMap<string, SlotMode>,
): TargetChoiceSpec[] {
  return specs.map((spec) => {
    const slotMode = modeOf?.get(spec.id);
    const bounds = targetBounds(spec);
    const total = divideTotal(state, spec, ctx);
    // D-149: one target for each opponent still in the game, at most.
    const opponents =
      spec.onePerOpponent === true
        ? state.seats.filter((s) => s.id !== ctx.controller && !s.hasLost).length
        : Number.MAX_SAFE_INTEGER;
    const legal = legalTargets(state, spec, ctx);
    return {
      specId: spec.id,
      min: Math.min(bounds.min, opponents),
      // D-234: "any number of target ...": every legal target at most.
      max: Math.min(
        total === null ? bounds.max : Math.min(bounds.max, total),
        opponents,
        spec.anyNumber === true ? legal.length : Number.MAX_SAFE_INTEGER,
      ),
      ...(total === null ? {} : { divide: total }),
      ...(spec.onePerOpponent === true ? { onePerGroup: true as const } : {}),
      ...(spec.differentFrom === undefined ? {} : { differentFrom: spec.differentFrom }),
      legal,
      ...(slotMode === undefined ? {} : { mode: slotMode.mode }),
      // D-1000: the slot of a later instance of a mode chosen more than once says which instance (the first says nothing).
      ...(slotMode === undefined || slotMode.instance === 0 ? {} : { instance: slotMode.instance }),
    };
  });
}

/**
 * Why `chosen` does not answer the decision, or null when it does: each slot gets between its
 * bounds of legal targets, never the same target twice in one slot (CR 601.2c), and no target for a
 * slot the decision does not have.
 */
/** The same object or player, whatever the slot each was chosen for. */
function sameTargetOf(a: ChosenTarget, b: ChosenTarget): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'object' ? a.id === (b as typeof a).id : a.seat === (b as typeof a).seat;
}

export function targetAnswerError(
  pending: Pick<TargetsDecision, 'specs'>,
  chosen: readonly ChosenTarget[],
): string | null {
  for (const spec of pending.specs) {
    const picks = chosen.filter((t) => t.specId === spec.specId);
    if (picks.length < spec.min || picks.length > spec.max) {
      return `Choose ${spec.min} to ${spec.max} targets for ${spec.specId}`;
    }
    for (const [i, t] of picks.entries()) {
      if (!spec.legal.some((l) => sameTarget(l, t))) return 'That is not a legal target';
      if (picks.slice(0, i).some((p) => sameTarget(p, t))) return 'Targets must be different';
    }
    // CR 115.3 (D-151): "other targets": none is a target chosen for the slot this one differs from.
    if (spec.differentFrom !== undefined) {
      const others = chosen.filter((t) => t.specId === spec.differentFrom);
      if (picks.some((t) => others.some((o) => sameTargetOf(o, t)))) {
        return 'Those targets must be different from the other target';
      }
    }
    // D-149: at most one target for each opponent: two targets of one player's are refused (the group is read from the legal list).
    if (spec.onePerGroup === true) {
      const groups = picks.map((t) => spec.legal.find((l) => sameTarget(l, t)));
      const owners = groups.map((l) => (l?.kind === 'object' ? l.group : undefined));
      if (owners.some((g, i) => g !== undefined && owners.indexOf(g) !== i)) {
        return 'Choose at most one target for each opponent';
      }
    }
    // CR 601.2d: the division is announced with the targets, each of them gets at least 1 and all of it is given out.
    const shares = picks.map((t) => t.share);
    if (spec.divide === undefined) {
      if (shares.some((s) => s !== undefined)) return 'Nothing is divided among those targets';
    } else if (picks.length > 0) {
      if (shares.some((s) => s === undefined || !Number.isSafeInteger(s) || s < 1)) {
        return 'Each target gets at least 1 of what is divided';
      }
      if (shares.reduce((n: number, s) => n + (s ?? 0), 0) !== spec.divide) {
        return `Divide exactly ${spec.divide} among the targets`;
      }
    }
  }
  if (chosen.some((t) => !pending.specs.some((s) => s.specId === t.specId))) {
    return 'Unknown target slot';
  }
  return null;
}

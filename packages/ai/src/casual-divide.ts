/**
 * CasualAgent and a division announced with the targets (CR 601.2d, D-145): "deals X damage divided as you choose among any number of
 * target creatures". The engine lists the total (`TargetChoiceSpec.divide`) and wants a `share` of at least 1 on each target chosen, adding
 * up to it. The agent kills as many of the opposing things as the total allows, the cheapest to kill first, and puts what is left on the
 * last of them; it never aims the damage at its own creatures or itself unless the slot needs a target (`min`) and nothing else is legal.
 */
import type {
  Action,
  ChosenTarget,
  GameView,
  TargetChoiceSpec,
  TargetsDecision,
} from '@commander-arena/engine';
import { chooseTargets } from './casual-choices';
import { findObject, isCreature, toughnessOf } from './casual-view';

/** What it takes to kill the target: the damage left before lethal for a creature, the life of a player, a little for anything else. */
function toKill(view: GameView, t: ChosenTarget): number {
  if (t.kind === 'player') return Math.max(1, view.seats.find((s) => s.id === t.seat)?.life ?? 1);
  const o = findObject(view, t.id);
  if (o === undefined) return 1;
  return isCreature(o) ? Math.max(1, toughnessOf(o) - o.damage) : 1;
}

const hostile = (view: GameView, t: ChosenTarget): boolean => {
  if (t.kind === 'player') return t.seat !== view.viewer;
  const o = findObject(view, t.id);
  return o !== undefined && o.controller !== view.viewer && isCreature(o);
};

/** The targets of one slot with the shares that add up to its total, or none when the total is 0. */
function divideSlot(view: GameView, spec: TargetChoiceSpec): ChosenTarget[] {
  const total = spec.divide ?? 0;
  if (total <= 0 || spec.max <= 0) return [];
  const ranked = spec.legal
    .map((t, index) => ({ t, index, need: toKill(view, t), foe: hostile(view, t) }))
    .filter((r) => r.foe)
    .sort((a, b) => a.need - b.need || a.index - b.index);
  const picked: ChosenTarget[] = [];
  let left = total;
  for (const r of ranked) {
    if (left <= 0 || picked.length >= spec.max) break;
    const share = Math.min(r.need, left);
    picked.push({ ...r.t, share });
    left -= share;
  }
  const last = picked[picked.length - 1];
  if (last !== undefined) {
    // What is left goes on the last target: all of the division is given out (CR 601.2d).
    picked[picked.length - 1] = { ...last, share: (last.share ?? 0) + left };
    return picked;
  }
  // No opposing target: only a slot that needs one is filled, with the first legal targets.
  return spec.legal.slice(0, Math.max(0, Math.min(spec.min, total))).map((t, i, all) => ({
    ...t,
    share: i === all.length - 1 ? total - (all.length - 1) : 1,
  }));
}

/** The answer to a targets decision with a division, or null when no slot divides anything. */
export function chooseDividedTargets(view: GameView, d: TargetsDecision): Action | null {
  if (!d.specs.some((s) => s.divide !== undefined)) return null;
  const others = d.specs.filter((s) => s.divide === undefined);
  const base: ChosenTarget[] = [];
  if (others.length > 0) {
    const rest = chooseTargets(view, { ...d, specs: others });
    if (rest.kind === 'chooseTargets') base.push(...rest.targets);
  }
  const divided = d.specs.filter((s) => s.divide !== undefined).flatMap((s) => divideSlot(view, s));
  return { kind: 'chooseTargets', targets: [...base, ...divided] };
}

/**
 * Changing the target of a spell or ability on the stack (CR 115.7a, 115.7b, D-181): the instruction `changeTarget`, run for the `changeTarget` effect
 * ("Change the target of target spell or ability with a single target.").
 *
 * The one target of the spell or ability can be changed only to another legal target for its slot: a target it could have chosen as it was put on the
 * stack, read as it is now, for its controller and with it as the source (hexproof, shroud and the slot's own words count; a target that is illegal by
 * now is not one). If there is no other legal target, the target stays as it is, even if it is illegal (CR 115.7a). The division of what a spell divides
 * stays (CR 115.7f). The player whose effect changes it chooses, so with one other legal target nothing is asked and with several a `targets`
 * decision (`forChange`) asks the controller of the effect. The change is the new target becoming the target of the spell or ability: `becameTarget`
 * follows for an object (Ward and the like, CR 603.2c). (The answer is `rules/change-target-answer.ts`: it goes on with the resolution, which this
 * file cannot import.)
 */
import type { ObjectId, SeatId } from '../ids';
import type { ChosenTarget } from '../state/chosen';
import type { TargetsDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameObject, GameState, ResolutionContext } from '../state/types';
import { becameTargetEvents } from './becomes-target';
import { type ChangeTargetInstruction, hasSingleTarget } from './change-source';
import { controllerOf } from './control';
import { targetSpecsOf } from './legality';
import { legalTargets, sameTarget } from './select';
import { done, type StepOutcome } from './step-outcome';

/** The legal targets of the slot the object's one target is in, other than the target it has (CR 115.7a). */
function otherLegalTargets(
  state: GameState,
  obj: GameObject,
  current: ChosenTarget,
): readonly ChosenTarget[] {
  const spec = targetSpecsOf(state, obj).find((s) => s.id === current.specId);
  const stack = obj.stack;
  if (spec === undefined || stack === null) return [];
  const legal = legalTargets(state, spec, {
    controller: controllerOf(state, obj),
    source: stack.source ?? obj.id,
    stackObject: obj.id,
    ...(stack.triggerPlayer === undefined ? {} : { triggerPlayer: stack.triggerPlayer }),
    ...(stack.triggerDamage === undefined ? {} : { triggerDamage: stack.triggerDamage }),
  });
  return legal.filter((t) => !sameTarget(t, current));
}

/**
 * The object with its target (the one `fromTarget`, or its only one) changed to `to`, the events of the change and of the new target becoming a
 * target.
 */
export function withChangedTarget(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  to: ChosenTarget,
  fromTarget?: ChosenTarget,
): { readonly state: GameState; readonly events: GameEvent[] } {
  const stack = obj.stack;
  const from =
    fromTarget === undefined
      ? stack?.chosenTargets[0]
      : stack?.chosenTargets.find((t) => sameTarget(t, fromTarget));
  if (stack === null || from === undefined) return { state, events: [] };
  // CR 115.7f: what the spell or ability divides stays as it was divided.
  const next: ChosenTarget = {
    ...to,
    specId: from.specId,
    ...(from.share === undefined ? {} : { share: from.share }),
  };
  const changed = patchObject(state, obj.id, {
    stack: { ...stack, chosenTargets: stack.chosenTargets.map((t) => (t === from ? next : t)) },
  });
  return {
    state: changed,
    events: [
      { kind: 'targetChanged', seat, object: obj.id, from, to: next },
      ...becameTargetEvents(changed, obj.id, controllerOf(state, obj)),
    ],
  };
}

/** Runs the instruction: nothing to change to, the only other legal target taken, or the question to the controller of the effect. */
export function runChangeTarget(
  state: GameState,
  res: ResolutionContext,
  ins: ChangeTargetInstruction,
): StepOutcome {
  const obj = state.objects[ins.object];
  if (ins.to !== undefined) return runChangeATarget(state, res, obj, ins.to);
  if (!hasSingleTarget(obj)) return done(state);
  const current = obj.stack?.chosenTargets[0];
  if (current === undefined) return done(state);
  const others = otherLegalTargets(state, obj, current);
  const [only] = others;
  if (only === undefined) return done(state);
  if (others.length === 1) {
    const changed = withChangedTarget(state, res.controller, obj, only);
    return done(changed.state, changed.events);
  }
  const decision: Omit<TargetsDecision, 'id'> = {
    kind: 'targets',
    seat: res.controller,
    source: res.object,
    specs: [{ specId: current.specId, min: 1, max: 1, legal: others }],
    forChange: true,
    subject: obj.id,
    current: [current],
  };
  return { state, events: [], front: [], needs: decision };
}

/** A target of a spell or ability that can be changed to a given object, and the target it would become (CR 115.7b). */
export interface ChangeCandidate {
  readonly current: ChosenTarget;
  readonly next: ChosenTarget;
}

/** The slot id the `targets` decision of "change a target" gives to the current targets it lists (the answer names which one to change). */
export const CHANGE_FROM_SPEC = 'changeFrom';

function sameIdentity(a: ChosenTarget, b: ChosenTarget): boolean {
  return a.kind === 'object'
    ? b.kind === 'object' && a.id === b.id
    : b.kind === 'player' && a.seat === b.seat;
}

/**
 * The targets of `obj` that `toId` could replace (CR 115.7b, unchecked against the CR text): `toId` is a legal target for the target's slot, read as now,
 * and is not already a target of that slot.
 */
export function changeCandidates(
  state: GameState,
  obj: GameObject,
  toId: ObjectId,
): ChangeCandidate[] {
  const stack = obj.stack;
  if (obj.zone !== 'stack' || stack === null) return [];
  const out: ChangeCandidate[] = [];
  for (const current of stack.chosenTargets) {
    const spec = targetSpecsOf(state, obj).find((s) => s.id === current.specId);
    if (spec === undefined) continue;
    const alreadyThere = stack.chosenTargets.some(
      (t) => t.specId === current.specId && t.kind === 'object' && t.id === toId,
    );
    if (alreadyThere) continue;
    const legal = legalTargets(state, spec, {
      controller: controllerOf(state, obj),
      source: stack.source ?? obj.id,
      stackObject: obj.id,
      ...(stack.triggerPlayer === undefined ? {} : { triggerPlayer: stack.triggerPlayer }),
      ...(stack.triggerDamage === undefined ? {} : { triggerDamage: stack.triggerDamage }),
    });
    const next = legal.find((t) => t.kind === 'object' && t.id === toId);
    if (next !== undefined) out.push({ current, next });
  }
  return out;
}

/** The change of the target `picked` (named by identity, as the answer gives it) of `obj` to `toId`; null when it cannot be changed. */
export function pickedChange(
  state: GameState,
  obj: GameObject,
  toId: ObjectId,
  picked: ChosenTarget,
): ChangeCandidate | null {
  return changeCandidates(state, obj, toId).find((c) => sameIdentity(c.current, picked)) ?? null;
}

/**
 * "Change a target of target spell or ability to <the source>" (CR 115.7b, unchecked against the CR text): the targets of `obj` that `to` could replace
 * can be changed to it. With none nothing changes; with one it is changed; with several a `targets` decision (`forChange`) asks the controller of the
 * effect which target to change (its legal list holds the current targets under the slot `changeFrom`; the answer is the one to change, see
 * `rules/change-target-answer.ts`).
 */
function runChangeATarget(
  state: GameState,
  res: ResolutionContext,
  obj: GameObject | undefined,
  toId: ObjectId,
): StepOutcome {
  if (obj === undefined) return done(state);
  const candidates = changeCandidates(state, obj, toId);
  const [first] = candidates;
  if (first === undefined) return done(state);
  if (candidates.length === 1) {
    const changed = withChangedTarget(state, res.controller, obj, first.next, first.current);
    return done(changed.state, changed.events);
  }
  const legal: ChosenTarget[] = [];
  for (const c of candidates) {
    if (!legal.some((l) => sameIdentity(l, c.current))) {
      legal.push({ ...c.current, specId: CHANGE_FROM_SPEC });
    }
  }
  const decision: Omit<TargetsDecision, 'id'> = {
    kind: 'targets',
    seat: res.controller,
    source: res.object,
    specs: [{ specId: CHANGE_FROM_SPEC, min: 1, max: 1, legal }],
    forChange: true,
    subject: obj.id,
    current: obj.stack?.chosenTargets ?? [],
  };
  return { state, events: [], front: [], needs: decision };
}

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
import type { SeatId } from '../ids';
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

/** The object with its target changed to `to`, the events of the change and of the new target becoming a target. */
export function withChangedTarget(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  to: ChosenTarget,
): { readonly state: GameState; readonly events: GameEvent[] } {
  const stack = obj.stack;
  const from = stack?.chosenTargets[0];
  if (stack === null || from === undefined) return { state, events: [] };
  // CR 115.7f: what the spell or ability divides stays as it was divided.
  const next: ChosenTarget = {
    ...to,
    specId: from.specId,
    ...(from.share === undefined ? {} : { share: from.share }),
  };
  const changed = patchObject(state, obj.id, { stack: { ...stack, chosenTargets: [next] } });
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

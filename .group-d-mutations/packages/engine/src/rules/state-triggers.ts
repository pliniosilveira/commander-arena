/**
 * State triggers (CR 603.8, D-139): "When there are four or more page counters on this artifact, exile it." A state trigger has no
 * event: it triggers when its condition is true as the game state is looked at, and only once each time the condition becomes true.
 * It does not trigger again until the ability has resolved, been countered or otherwise left the stack, and then, if the condition
 * still holds, it triggers again (CR 603.8). So the check skips an ability of the permanent that is already waiting to go on the
 * stack or is on the stack.
 *
 * Only a permanent on the battlefield has them (CR 603.8 is about permanents' abilities here), read from its derived abilities; the
 * condition is read for the controller, with the permanent as the source, as an intervening "if" is. `collectTriggers` calls this
 * after every batch of events (`rules/triggers.ts`); the scan skips a permanent whose printed abilities have no state trigger
 * without deriving it.
 */
import type { GameState, PendingTrigger } from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { printedAbilities } from './derive-statics';

/** The state triggers of the battlefield that trigger now; `waiting` are the triggers found in the same pass. */
export function findStateTriggers(
  state: GameState,
  waiting: readonly PendingTrigger[],
): PendingTrigger[] {
  const found: PendingTrigger[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined) continue;
    const hasOne = printedAbilities(state, obj).some(
      (a) => a.kind === 'triggered' && a.trigger.kind === 'state',
    );
    if (!hasOne) continue;
    derive(state, obj).abilities.forEach((ability, index) => {
      if (ability.kind !== 'triggered' || ability.trigger.kind !== 'state') return;
      const same = (p: PendingTrigger): boolean => p.source === id && p.abilityIndex === index;
      if (state.pendingTriggers.some(same) || waiting.some(same) || found.some(same)) return;
      const onStack = state.stack.some((sid) => {
        const stack = state.objects[sid]?.stack;
        return stack?.source === id && stack.abilityIndex === index;
      });
      if (onStack) return;
      const ctx = { controller: controllerOf(state, obj), source: id };
      if (!evaluateCondition(state, ability.trigger.condition, ctx)) return;
      if (
        ability.interveningIf !== undefined &&
        !evaluateCondition(state, ability.interveningIf, ctx)
      ) {
        return;
      }
      found.push({
        source: id,
        controller: controllerOf(state, obj),
        abilityIndex: index,
        ability,
        subject: null,
      });
    });
  }
  return found;
}

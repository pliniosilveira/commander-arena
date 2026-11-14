/**
 * Split second (CR 702.61): "As long as this spell is on the stack, players can't cast other spells or
 * activate abilities that aren't mana abilities." (CR 702.61a)
 *
 * The one check is read where the engine decides what a player may do: `canCast` and
 * `activationRefusal`, which both build the priority options and validate the action chosen, so the legal
 * actions and `applyAction` cannot disagree. Mana abilities and special actions (a land play, which needs
 * an empty stack anyway) stay, and triggered abilities trigger and go on the stack as normal (CR 702.61b),
 * which nothing here touches.
 */
import type { GameState } from '../state/types';
import { derive } from './derive';

/** Whether a spell with split second is on the stack now. */
export function splitSecondOnStack(state: GameState): boolean {
  return state.stack.some((id) => {
    const obj = state.objects[id];
    if (obj?.stack?.kind !== 'spell') return false;
    return derive(state, obj).abilities.some(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'splitSecond',
    );
  });
}

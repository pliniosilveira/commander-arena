/**
 * "As long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all loyalty counters on it being
 * removed, instead all but one of those counters are removed." (CR 614.1a, 120.3c, 614.5; Deification): the replacement `keepOneLoyalty` of a permanent on the
 * battlefield, read from the abilities it has now (so "loses all abilities" turns it off, CR 613.1f). It replaces the result of the damage (the loyalty counters
 * removed), not the damage: the damage is still dealt in full (lifelink and the like are unchanged). `damage.ts` asks here as it removes the loyalty counters.
 */
import type { SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { matchesFilter } from './select';

/** Whether a `keepOneLoyalty` of some permanent applies to `walker` now: its condition holds for its controller and `walker` is one of its planeswalkers. */
export function keepsOneLoyalty(state: GameState, walker: GameObject): boolean {
  for (const id of state.battlefield) {
    const holder = state.objects[id];
    if (holder === undefined) continue;
    const seat: SeatId = controllerOf(state, holder);
    for (const ability of derive(state, holder).abilities) {
      if (ability.kind !== 'replacement' || ability.replacement.kind !== 'keepOneLoyalty') {
        continue;
      }
      const { planeswalkers, while: when } = ability.replacement;
      const ctx = {
        controller: seat,
        source: id,
        ...(holder.chosen === undefined ? {} : { sourceChosen: holder.chosen }),
      };
      if (when !== undefined && !evaluateCondition(state, when, ctx)) continue;
      if (matchesFilter(state, walker, { ...planeswalkers, zone: 'battlefield' }, ctx)) {
        return true;
      }
    }
  }
  return false;
}

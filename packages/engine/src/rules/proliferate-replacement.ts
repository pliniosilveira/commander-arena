/**
 * "If you would proliferate, proliferate twice instead." (Tekuthal, Inquiry Dominus; CR 701.34a, 614.1a, 614.5): a replacement effect of a permanent on the battlefield that
 * doubles how many times its controller proliferates. Each such effect applies once to the action (CR 614.5), so two of them make four, as two effects that double damage make the
 * damage four times as much (the example of CR 614.5). It is the ability of the permanent (lost with "loses all abilities") and applies to its controller only.
 */
import type { SeatId } from '../ids';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** How many times `seat` proliferates when an effect says to proliferate `times` times: `times`, doubled by each `proliferateDouble` replacement the seat's permanents have. */
export function proliferateTimes(state: GameState, seat: SeatId, times: number): number {
  if (times <= 0) return 0;
  let doublings = 0;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat) continue;
    for (const ability of derive(state, obj).abilities) {
      if (ability.kind === 'replacement' && ability.replacement.kind === 'proliferateDouble') {
        doublings += 1;
      }
    }
  }
  return times * 2 ** doublings;
}

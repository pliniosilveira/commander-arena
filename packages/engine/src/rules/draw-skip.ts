/**
 * Replacement effects of a card draw (CR 614.11, 121.6; D-332): "If you would draw a card while your library has no cards in it, skip that draw
 * instead" is the replacement `skipDraw` of a permanent on the battlefield, read from the abilities it has now (so "loses all abilities" turns it
 * off, CR 613.1f). Every draw of its controller goes through `drawCard` (the effects and the draw step alike), which asks here first, so the
 * replacement is applied even when the library is empty (CR 614.11, 121.6a) and before anything could be attempted from it (CR 121.4).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';
import { plainConditionHolds } from './condition-reads';
import { controllerOf } from './control';
import { derive } from './derive';

/**
 * The permanent whose `skipDraw` replaces a draw of `seat` now, or null when none does. The oldest permanent is used when several apply (their
 * result is the same: the draw is skipped, CR 614.5 gives one opportunity to each).
 */
export function drawSkippedBy(state: GameState, seat: SeatId): ObjectId | null {
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat) continue;
    for (const ability of derive(state, obj).abilities) {
      if (ability.kind !== 'replacement' || ability.replacement.kind !== 'skipDraw') continue;
      const when = ability.replacement.while;
      if (when === undefined || plainConditionHolds(state, when, seat)) return id;
    }
  }
  return null;
}

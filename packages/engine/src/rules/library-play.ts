/**
 * "You may play lands from the top of your library." (Oracle of Mul Daya; CR 305.1, 401.5, 604.1, 113.6): the static ability `playLandsFromTopOfLibrary` of a permanent
 * gives its controller the permission to play the top card of their library as a land play. When a land may be played, and how many, are those of the turn
 * (CR 305.2): the permission only says where the land card may come from, and it is not used up. Read from the abilities a permanent has now, so a permanent that
 * lost them gives nothing (CR 613.1f).
 */
import type { SeatId } from '../ids';
import { getObject, getSeat } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';
import { matchesFilter } from './select';

/** Whether `obj`, a card in a library, is the top card of the library of `seat`, and a permanent `seat` controls lets them play it as a land. */
export function libraryLandPermission(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (obj.zone !== 'library' || obj.owner !== seat || obj.card === null) return false;
  if (getSeat(state, seat).library[0] !== obj.id) return false;
  return state.battlefield.some((id) => {
    const source = getObject(state, id);
    if (controllerOf(state, source) !== seat) return false;
    if (!mayHaveStatic(state, source, 'playLandsFromTopOfLibrary')) return false;
    return derive(state, source).abilities.some(
      (a) =>
        a.kind === 'static' &&
        a.static.kind === 'playLandsFromTopOfLibrary' &&
        // "As long as ~ is attached to a creature, you may play lands ...": the condition is read now, for the controller of the permanent.
        (a.condition === undefined ||
          evaluateCondition(state, a.condition, { controller: seat, source: source.id })) &&
        (a.static.lands === undefined ||
          matchesFilter(
            state,
            obj,
            { ...a.static.lands, zone: 'library' },
            { controller: seat, source: source.id },
          )),
    );
  });
}

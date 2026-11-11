/**
 * The city's blessing (CR 702.131, D-264): a designation a player has, with no meaning of its own beyond being a marker that other rules and
 * effects read (CR 702.131c). Unlike the monarch, any number of players may have it at once, so it is kept on the seat
 * (`SeatState.citysBlessing`, read through `rules/designations.ts`), and it is kept for the rest of the game: nothing in the engine takes it away.
 *
 * Ascend on a permanent is a static ability, "Any time you control ten or more permanents and you don't have the city's blessing, you get the
 * city's blessing for the rest of the game" (CR 702.131b). The engine reads "any time" as a check made with the state-based actions (CR 704.3), which
 * it makes whenever a player would get priority, after every action and every resolution; the engine's own choice, since Ascend is not a
 * state-based action in the CR. The player has it before any trigger could be put on the stack (CR 702.131d: continuous effects are reapplied, and
 * `derive` reads the state afresh, before triggers are checked). KNOWN APPROXIMATION (D-264, docs/ROADMAP.md): inside one resolution, between two
 * steps of the same effect ("create two tokens, then if you have the city's blessing ..."), the check has not run yet, so such a card would read the
 * answer from before the tokens. The instant and sorcery form (CR 702.131a) is a spell ability and is not built: `validateCard` refuses it.
 */

import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** CR 702.131b: ten permanents. */
const PERMANENTS_NEEDED = 10;

/**
 * Gives the city's blessing to every player who does not have it and controls ten or more permanents, at least one of which has Ascend (CR 702.131b).
 * A permanent that lost its abilities does not have it (layer 6, read from `derive`). Returns null when nobody gets it.
 */
export function gainCitysBlessings(
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  const waiting = state.seats.filter((s) => !s.hasLost && s.citysBlessing !== true);
  if (waiting.length === 0) return null;
  const permanents = new Map<SeatId, number>();
  for (const obj of Object.values(state.objects)) {
    if (obj.zone !== 'battlefield') continue;
    const seat = controllerOf(state, obj);
    permanents.set(seat, (permanents.get(seat) ?? 0) + 1);
  }
  let next = state;
  const events: GameEvent[] = [];
  for (const s of waiting) {
    if ((permanents.get(s.id) ?? 0) < PERMANENTS_NEEDED) continue;
    const hasAscend = Object.values(state.objects).some(
      (obj) =>
        obj.zone === 'battlefield' &&
        controllerOf(state, obj) === s.id &&
        derive(state, obj).abilities.some(
          (a) => a.kind === 'keyword' && a.keyword.kind === 'ascend',
        ),
    );
    if (!hasAscend) continue;
    next = patchSeat(next, s.id, { citysBlessing: true });
    events.push({ kind: 'citysBlessingGained', seat: s.id });
  }
  return events.length === 0 ? null : { state: next, events };
}

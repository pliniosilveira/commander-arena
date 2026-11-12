/**
 * The permanents of one event that enter the battlefield together (CR 603.6a, 614.12b, 400.7, D-951: "return those cards to the battlefield"). A replacement effect that
 * modifies how a permanent enters (an "as this enters" choice, "enters with counters", "enters tapped", the effect of a permanent on the battlefield that makes others enter
 * with counters or untapped, a count of the battlefield) applies from the continuous effects that already exist as the permanent would exist on the battlefield (CR 614.12,
 * the example of Orb of Dreams: a permanent does not affect itself entering); a permanent that enters in the same event does not exist on the battlefield yet, and a choice
 * is made before anything enters (CR 614.12a). So a card of the run does not see the cards that enter with it, although the engine puts them onto the battlefield one after
 * the other. `withoutRun` is the battlefield those replacement effects read: the state with the permanents of the run that are already there taken out of
 * `state.battlefield` (the objects are untouched, so nothing else reads a different game). The enters abilities that trigger look at the event instead and see each other
 * (CR 603.6a, `rules/triggers.ts`, the `simultaneous` mark of `zoneChanged`).
 */
import type { ObjectId } from '../ids';
import type { GameState } from '../state/types';

/** `state` as the replacement effects of a card that enters with `run` see it: without the permanents of `run` (the ones that entered before it in the same event). */
export function withoutRun(state: GameState, run: readonly ObjectId[] | undefined): GameState {
  if (run === undefined || run.length === 0) return state;
  if (!state.battlefield.some((id) => run.includes(id))) return state;
  return { ...state, battlefield: state.battlefield.filter((id) => !run.includes(id)) };
}

/**
 * "Exile ... until this leaves the battlefield" (CR 610.3, cleanup C): some one-shot effects exile an object until a specified event
 * occurs, and "a second one-shot effect is created immediately after the specified event" that returns it to its previous zone. That
 * second effect is not a triggered ability (CR 603), so it does not go on the stack and nobody can respond to it: the card is back
 * before any player receives priority. The exile records an `ExileReturn` (`GameState.exileReturns`); `settle` calls `releaseExiled`
 * before it looks at state-based actions and triggers, which is the engine's "immediately after" for an event of any origin (a
 * resolving spell, a state-based action, a cost).
 *
 * - CR 610.3a, 610.3b: when the event had already happened as the exile would occur, nothing is exiled (`exile` in `effects.ts`, so there
 *   is never a record for it).
 * - CR 610.3c: the card returns under its owner's control (`controller: 'owner'`); an Aura chooses what it enchants (CR 303.4f).
 * - CR 610.3d: all the returns that follow simultaneous events are simultaneous: they are one batch of instructions of one resolution, so
 *   the triggers of everything that enters are noticed together, after all of it has entered.
 * - CR 400.7: a card that left exile since is a new object. Its record is dropped and nothing moves.
 *
 * The batch runs as a resolution with no object on the stack. A decision inside it (the host of an Aura, an "enters" choice) pauses it
 * like any other resolution and is answered through the same path (`answerResolutionChoice`).
 */
import type { GameEvent } from '../state/events';
import type { GameState, Instruction } from '../state/types';
import { withAuraEntries } from './aura-entry';
import { moveInstructions } from './effect-support';
import { continueResolution } from './stack';

export interface ReleaseOutcome {
  readonly state: GameState;
  readonly events: GameEvent[];
  /** A decision is pending inside the batch (`state.pending` is set and `state.resolution` holds the rest of it). */
  readonly paused: boolean;
}

/** Returns the cards whose permanent has left the battlefield; null when none is due. */
export function releaseExiled(state: GameState): ReleaseOutcome | null {
  // D-231 (CR 610.3): "until an opponent becomes the monarch" is due when one did (`released`), whatever happens to the permanent; every other is due as its permanent leaves.
  const due = state.exileReturns.filter((r) =>
    r.untilMonarch === true ? r.released === true : state.objects[r.source]?.zone !== 'battlefield',
  );
  const first = due[0];
  if (first === undefined) return null;
  const remaining = state.exileReturns.filter((r) => !due.includes(r));
  // CR 400.7: a card that is no longer in exile as that object has nothing to return.
  const cards = due.map((r) => r.card).filter((id) => state.objects[id]?.zone === 'exile');
  const queue: Instruction[] = withAuraEntries(
    state,
    moveInstructions(cards, 'battlefield', 'top', false, 'owner'),
  );
  const next: GameState = {
    ...state,
    exileReturns: remaining,
    resolution: {
      object: first.source,
      source: first.source,
      controller: first.controller,
      queue,
      legalTargets: [],
    },
  };
  const r = continueResolution(next);
  return { state: r.state, events: r.events, paused: r.paused };
}

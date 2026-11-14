/**
 * Madness (CR 702.35a, D-128): "If a player would discard this card, that player discards it, but exiles it instead of
 * putting it into their graveyard." and "When this card is exiled this way, its owner may cast it by paying [cost]
 * rather than paying its mana cost. If that player doesn't, they put this card into their graveyard."
 *
 * The first is a replacement of where a discarded card goes, and every discard goes through `discardOne` so that it
 * applies to all of them: the discard of a spell or ability effect (`rules/search.ts`), of the cleanup step
 * (`rules/flow.ts`), of a cost (`rules/discard-cost.ts`, Cycling's "discard this card", `rules/activate-costs.ts`),
 * and the cost of Ward and "unless pays" (`discardObjects`). The card is still discarded (the `discarded` event, so
 * "whenever you discard" abilities see it), only its destination changes. Exile is not a choice (CR 702.35a: it
 * "exiles it instead"); the choice is the cast that follows.
 * The second is a triggered ability that works from exile (`rules/later-triggers.ts`), found from the `madnessExiled`
 * event, which this function emits; its resolution is `rules/cast-exiled.ts`.
 * A commander discarded this way is a commander in exile: its owner may put it into the command zone with the
 * state-based action (CR 903.9a) before the ability goes on the stack, and then there is nothing to cast.
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { definitionOf } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { alternativeOf } from './alt-costs';
import { moveObject } from './zones';

/** Whether the card has madness (its front face lists a madness cost, CR 702.35a). */
export function hasMadness(state: GameState, obj: GameObject): boolean {
  if (obj.card === null) return false;
  return alternativeOf(definitionOf(state, obj.card).faces[0] ?? null, 'madness') !== null;
}

/**
 * `seat` discards the card `id` from their hand: it goes to the graveyard, or to exile when it has madness (CR 702.35a).
 * Null if the card could not be moved (the callers have checked it is in the hand: a discard never asks about a
 * commander, CR 903.9b asks for the hand and the library).
 */
export function discardOne(
  state: GameState,
  seat: SeatId,
  id: ObjectId,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  const obj = state.objects[id];
  if (obj === undefined) return null;
  const madness = hasMadness(state, obj);
  const moved = moveObject(state, { object: id, to: madness ? 'exile' : 'graveyard' });
  if (moved.kind !== 'done') return null;
  const events: GameEvent[] = [
    ...moved.events,
    { kind: 'discarded', seat, object: id, to: moved.newObject },
  ];
  if (madness && moved.newObject !== null) {
    events.push({ kind: 'madnessExiled', seat, object: moved.newObject });
  }
  return { state: moved.state, events };
}

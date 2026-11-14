/**
 * Exiling cards from the graveyard as a cost (CR 702.138a, Escape; CR 118.8, 601.2h; D-124): the pieces of the
 * cost of an escape spell (`cast-additional.ts`). The caster chooses the cards (all of them when the graveyard
 * holds exactly that many besides the spell); each goes from the graveyard to exile, a `zoneChanged` event
 * apiece. The cards are public, like those discarded, since they go to a public zone.
 */
import type { ObjectId, SeatId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';
import { moveObject } from './zones';

/** The words of an exile prompt: "Exile one other card from your graveyard." */
export function exilePrompt(count: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const n = words[count] ?? String(count);
  return `Exile ${n} other ${count === 1 ? 'card' : 'cards'} from your graveyard.`;
}

/**
 * The question "which other cards do you exile?" for an escape cost: exactly `count` of `graveyard`, public. It
 * is always a cost being paid, so `cancel` rewinds the cast (CR 733).
 */
export function exileCostDecision(
  seat: SeatId,
  source: ObjectId,
  graveyard: readonly ObjectId[],
  count: number,
): NewDecision {
  return {
    kind: 'chooseCards',
    seat,
    source,
    purpose: 'exile',
    zone: 'graveyard',
    legal: graveyard,
    min: count,
    max: count,
    reveal: true,
    prompt: exilePrompt(count),
    forCost: true,
  };
}

/**
 * CR 702.138a: moves the chosen cards from the graveyard to exile. Null if one is not in a graveyard (the
 * caller checked the answer, so this is a refusal rather than a case that arises).
 */
export function exileObjects(
  state: GameState,
  chosen: readonly ObjectId[],
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  let next = state;
  const events: GameEvent[] = [];
  for (const id of chosen) {
    if (next.objects[id]?.zone !== 'graveyard') return null;
    const moved = moveObject(next, { object: id, to: 'exile' });
    if (moved.kind !== 'done') return null;
    next = moved.state;
    events.push(...moved.events);
  }
  return { state: next, events };
}

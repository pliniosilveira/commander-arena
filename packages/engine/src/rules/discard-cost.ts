/**
 * Discarding cards as a cost (CR 701.9, 118.8, 602.2b; D-095): the pieces shared by an additional
 * cost of a spell (`cast-additional.ts`), a cost of an activated ability (`activate.ts`) and the
 * cost of Ward (`pay-unless.ts`). The player chooses the cards (the whole hand when it holds exactly
 * that many); the cards go from the hand to the graveyard, each with a `discarded` event.
 */
import type { Cost } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';
import { nameOf } from './damage-order-text';
import { discardOne } from './madness';
import { matchesFilter } from './select';

/** The words of a discard prompt: "Discard a card." / "Discard two cards.". */
export function discardPrompt(count: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  return count === 1 ? 'Discard a card.' : `Discard ${words[count] ?? count} cards.`;
}

/**
 * The cards of the hand of `seat` an activation of `source` may discard (D-207, CR 701.9): all of them, or those the cost's filter matches ("a
 * legendary card") and, for "another card named ~", that have the name of `source` and are not `source`.
 */
export function discardCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  spec: Pick<Extract<Cost, { kind: 'discard' }>, 'filter' | 'named'> | null,
): ObjectId[] {
  const hand = state.seats[seat]?.hand ?? [];
  if (spec === null || (spec.filter === undefined && spec.named !== true)) return [...hand];
  const name = nameOf(state, source);
  return hand.filter((id) => {
    const card = state.objects[id];
    if (card === undefined || id === source) return false;
    if (spec.named === true && nameOf(state, id) !== name) return false;
    return (
      spec.filter === undefined ||
      matchesFilter(state, card, { ...spec.filter, zone: 'hand' }, { controller: seat, source })
    );
  });
}

/**
 * The question "which cards do you discard?" for a cost: exactly `count` of `hand`, public (the
 * cards go to the graveyard). `forCost` lets a cast or an activation be taken back (CR 733); Ward's
 * payer has already accepted, so it passes false.
 */
export function discardCostDecision(
  seat: SeatId,
  source: ObjectId,
  hand: readonly ObjectId[],
  count: number,
  forCost: boolean,
): NewDecision {
  return {
    kind: 'chooseCards',
    seat,
    source,
    purpose: 'discard',
    zone: 'hand',
    legal: hand,
    min: count,
    max: count,
    reveal: true,
    prompt: discardPrompt(count),
    ...(forCost ? { forCost: true as const } : {}),
  };
}

/**
 * CR 701.9a: moves the chosen cards from the hand to the graveyard. Null if one is not in the hand
 * (the caller checked the answer, so this is a refusal rather than a case that arises). A move to
 * a graveyard never asks about a commander (CR 903.9b asks for the hand and the library).
 */
export function discardObjects(
  state: GameState,
  seat: SeatId,
  chosen: readonly ObjectId[],
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  let next = state;
  const events: GameEvent[] = [];
  for (const id of chosen) {
    if (next.objects[id]?.zone !== 'hand') return null;
    const discarded = discardOne(next, seat, id); // CR 702.35a: madness exiles it instead
    if (discarded === null) return null;
    next = discarded.state;
    events.push(...discarded.events);
  }
  return { state: next, events };
}

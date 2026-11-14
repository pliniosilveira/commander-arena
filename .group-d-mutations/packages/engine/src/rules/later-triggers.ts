/**
 * The triggered abilities of Suspend and Madness that work from the exile zone, and the one of Miracle that works from the hand (CR 702.62a,
 * 702.35a, 702.94a, D-128, D-274).
 * They are the card's own and fixed by the rules, so the engine finds them itself instead of reading them from the
 * derived abilities of a battlefield permanent (`rules/triggers.ts` looks at the battlefield only): each is a
 * `PendingTrigger` with the card in exile as its source, no index among its abilities (`abilityIndex` -1, as a
 * delayed trigger) and the ability below as its text. It then goes on the stack like every triggered ability (CR
 * 603.3), is ordered by its controller, shown as an ability of the card, and can be responded to.
 *
 * - "At the beginning of your upkeep, if this card is suspended, remove a time counter from it" (CR 702.62a): at the
 *   beginning of the upkeep of a player, one trigger for each suspended card they own (CR 702.62b). The "if" is read
 *   as it triggers, here, and again as the ability resolves (`removeTimeCounter`, CR 603.4).
 * - "When the last time counter is removed from this card, if it's exiled, you may play it without paying its mana
 *   cost if able" (CR 702.62a): when a `counterRemoved` event takes the last time counter off a card with suspend that
 *   is in exile. "Play" is "cast" here (a land cannot have suspend, `validateCard`).
 * - "When this card is exiled this way, its owner may cast it by paying [cost] rather than paying its mana cost. If
 *   that player doesn't, they put this card into their graveyard" (CR 702.35a): when a `madnessExiled` event says
 *   the card was exiled instead of discarded.
 * - "When you reveal this card this way, you may cast it by paying [cost] rather than its mana cost" (CR 702.94a): when a `miracleRevealed`
 *   event says the card in the hand was revealed as it was drawn.
 * Their controller is the owner of the card (a card in exile or in a hand has no controller, CR 108.4).
 */
import type { GameEvent } from '../state/events';
import type { GameState, PendingTrigger, TriggeredAbility } from '../state/types';
import { faceOf } from './legality';
import { suspendOf } from './special-legality';
import { TIME_COUNTER } from './time-counter';

const UPKEEP_OF_OWNER = { kind: 'upkeep', whose: 'you' } as const;

/** CR 702.62a: the upkeep ability. The trigger is found by `findLaterTriggers`, not matched, so `trigger` is its text. */
export const SUSPEND_TICK_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: UPKEEP_OF_OWNER,
  effect: { kind: 'removeTimeCounter' },
};

/** CR 702.62a: the ability that casts the card when its last time counter is gone. */
export const SUSPEND_CAST_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: UPKEEP_OF_OWNER,
  effect: { kind: 'castExiled', mode: 'suspend' },
};

/** CR 702.35a: the ability that lets the owner cast the card for its madness cost, or puts it into the graveyard. */
export const MADNESS_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: UPKEEP_OF_OWNER,
  effect: { kind: 'castExiled', mode: 'madness' },
};

/**
 * CR 702.94a: "When you reveal this card this way, you may cast it by paying [cost] rather than its mana cost": the ability of a card revealed
 * as it was drawn (D-274). Its source is the card in its owner's hand.
 */
export const MIRACLE_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: UPKEEP_OF_OWNER,
  effect: { kind: 'castExiled', mode: 'miracle' },
};

function trigger(
  source: PendingTrigger['source'],
  controller: number,
  ability: TriggeredAbility,
): PendingTrigger {
  return { source, controller, abilityIndex: -1, ability, subject: null };
}

/** The triggers of Suspend and Madness the events cause (see the file comment), in event order. */
export function findLaterTriggers(
  state: GameState,
  events: readonly GameEvent[],
): PendingTrigger[] {
  const found: PendingTrigger[] = [];
  for (const event of events) {
    // CR 702.94a (D-274): the trigger of a card revealed as it was drawn works from the hand (the exile may be empty).
    // It triggers whatever became of the card since (CR 702.94a: "When you reveal this card this way"; a card an earlier instruction of the same
    // resolution discarded is known by last-known information, and the ability then finds nothing to cast, CR 113.7a, 608.2b).
    if (event.kind === 'miracleRevealed') {
      if (state.objects[event.object] === undefined && state.lki[event.object] === undefined)
        continue;
      found.push(trigger(event.object, event.seat, MIRACLE_ABILITY));
      continue;
    }
    if (state.exile.length === 0) continue;
    if (event.kind === 'stepBegan' && event.step === 'upkeep') {
      // One for each card the player owns that is suspended, in the order the cards came to exile (CR 702.62b).
      for (const id of state.exile) {
        const card = state.objects[id];
        if (card === undefined || card.owner !== event.seat) continue;
        if ((card.counters[TIME_COUNTER] ?? 0) < 1 || suspendOf(faceOf(state, card)) === null)
          continue;
        found.push(trigger(id, card.owner, SUSPEND_TICK_ABILITY));
      }
    } else if (event.kind === 'counterRemoved' && event.counter === TIME_COUNTER) {
      const card = state.objects[event.object];
      if (card?.zone !== 'exile' || (card.counters[TIME_COUNTER] ?? 0) > 0) continue;
      if (suspendOf(faceOf(state, card)) === null) continue;
      found.push(trigger(card.id, card.owner, SUSPEND_CAST_ABILITY));
    } else if (event.kind === 'madnessExiled') {
      const card = state.objects[event.object];
      if (card?.zone !== 'exile') continue;
      found.push(trigger(card.id, card.owner, MADNESS_ABILITY));
    }
  }
  return found;
}

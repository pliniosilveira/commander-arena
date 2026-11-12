/**
 * Priority (CR 117). Having priority is a decision (SPEC 17.1 A2): the engine asks the seat what
 * to do, with the options computed by the same legality code that validates the answer.
 */
import type { SeatId } from '../ids';
import type { PriorityOption } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getObject, seatsInOrder } from '../state/ops';
import type { GameState } from '../state/types';
import { activatableAbilities } from './activate-legality';
import { turnableObjects } from './face-down-legality';
import {
  alternativeCastObjects,
  castableObjects,
  escapeObjects,
  flashbackObjects,
  foretellCastObjects,
  playableLands,
} from './legality';
import { activationChoices, manaSacrificeCandidates } from './mana-abilities';
import { canActivateManaAbility, manaAbilitiesOf } from './mana-engine';
import { setPending } from './set-pending';
import { settle } from './settle';
import { foretellableObjects, suspendableObjects } from './special-legality';

/** The alternative costs listed on a face, in the order their options are offered (D-121). */
const ALTERNATIVES = ['free', 'overload', 'evoke', 'dash', 'spectacle', 'tapPermanents'] as const;

export function priorityOptions(state: GameState, seat: SeatId): PriorityOption[] {
  const options: PriorityOption[] = [{ kind: 'pass' }];
  // A card with several faces to choose from has one option per face (CR 709.3, 712.11b, 712.12, 715.3).
  for (const land of playableLands(state, seat)) options.push({ kind: 'playLand', ...land });
  for (const spell of castableObjects(state, seat)) options.push({ kind: 'castSpell', ...spell });
  // CR 118.9 (D-095, D-121): the same cards cast for an alternative cost the card lists, one option for
  // each that can be paid: without paying their mana cost, or for their overload cost.
  for (const alternative of ALTERNATIVES) {
    for (const spell of alternativeCastObjects(state, seat, alternative)) {
      options.push({ kind: 'castSpell', ...spell, alternative });
    }
  }
  // CR 702.34a (Flashback): a card in the graveyard is cast by its alternative cost.
  for (const object of flashbackObjects(state, seat)) {
    options.push({ kind: 'castSpell', object, alternative: 'flashback' });
  }
  // CR 702.138a (Escape, D-124): a card in the graveyard is cast for its escape cost, one option for each.
  for (const object of escapeObjects(state, seat)) {
    options.push({ kind: 'castSpell', object, alternative: 'escape' });
  }
  // CR 702.143a (Foretell, D-128): a foretold card in exile is cast for its foretell cost, in a later turn.
  for (const object of foretellCastObjects(state, seat)) {
    options.push({ kind: 'castSpell', object, alternative: 'foretell' });
  }
  // CR 116.2f, 116.2h (D-128): the special actions of Suspend and Foretell; they do not use the stack.
  for (const object of suspendableObjects(state, seat)) options.push({ kind: 'suspend', object });
  for (const object of foretellableObjects(state, seat)) options.push({ kind: 'foretell', object });
  // CR 116.2b, 701.40b (D-963): turning a face-down permanent face up is a special action too, with priority and no other timing.
  for (const object of turnableObjects(state, seat)) options.push({ kind: 'turnFaceUp', object });
  // Activated abilities that are not mana abilities (CR 602): from the battlefield and from the hand.
  for (const { object, abilityIndex } of activatableAbilities(state, seat)) {
    options.push({ kind: 'activate', object, abilityIndex });
  }
  // Mana abilities may be activated whenever the seat has priority (CR 605.3a).
  for (const id of state.battlefield) {
    const obj = getObject(state, id);
    for (const { abilityIndex, ability } of manaAbilitiesOf(state, obj)) {
      if (!canActivateManaAbility(state, obj, ability, seat)) continue;
      // CR 601.2b, 605.3b (D-222): a cost "Sacrifice a Spirit" is chosen by the player: one option for each permanent they may give up when there are several.
      const gives = manaSacrificeCandidates(state, seat, id, ability);
      for (const choice of activationChoices(state, obj, ability)) {
        if (gives.length < 2) {
          options.push({ kind: 'activateAbility', source: id, abilityIndex, ...choice });
          continue;
        }
        for (const sacrifice of gives) {
          options.push({ kind: 'activateAbility', source: id, abilityIndex, ...choice, sacrifice });
        }
      }
    }
  }
  options.push({ kind: 'concede' });
  return options;
}

export interface Outcome {
  readonly state: GameState;
  readonly events: GameEvent[];
}

/**
 * Gives `seat` priority (CR 117.3). First performs state-based actions until none apply and puts
 * waiting triggered abilities on the stack (CR 117.5, 603.3); that can end the game or ask a
 * decision. `prior` holds the events of the changes that led here: abilities they triggered go on
 * the stack now. The returned events are only those this call produced. Passes in succession are
 * cleared by the caller.
 */
export function grantPriority(
  input: GameState,
  seat: SeatId,
  prior: readonly GameEvent[] = [],
): Outcome {
  const settled = settle({ ...input, turn: { ...input.turn, prioritySeat: seat } }, prior);
  if (settled.state.result) return { state: settled.state, events: settled.events };
  // CR 610.3: a card returning from exile asks a question (the host of an Aura) before priority is given.
  if (settled.paused) return { state: settled.state, events: settled.events };
  if (settled.decision) {
    return { state: setPending(settled.state, settled.decision), events: settled.events };
  }
  // A seat that lost during settling cannot hold priority; pass it to the next seat in turn order.
  let holder = seat;
  if (settled.state.seats[seat]?.hasLost) {
    const next = seatsInOrder(settled.state, seat)[0];
    if (next === undefined) return { state: settled.state, events: settled.events };
    holder = next;
  }
  const state = setPending(
    { ...settled.state, turn: { ...settled.state.turn, prioritySeat: holder } },
    {
      kind: 'priority',
      seat: holder,
      options: priorityOptions(settled.state, holder),
    },
  );
  return { state, events: settled.events };
}

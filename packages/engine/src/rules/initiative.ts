/**
 * The initiative (CR 726): a designation a player can have. At most one player has it (`GameState.initiative`, CR 726.3), and there is none until an effect instructs a player to
 * take it (CR 726.1).
 *
 * Three inherent triggered abilities go with it (CR 726.2): "At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity", "Whenever one
 * or more creatures a player controls deal combat damage to the player who has the initiative, the controller of those creatures takes the initiative" and "Whenever a player takes
 * the initiative, that player ventures into Undercity". They have no source and are controlled by the player who had the initiative at the time they triggered (an exception to
 * CR 113.8): `findInitiativeTriggers` makes them pending triggers with no `source`, they go on the stack like any other (CR 603.3) as ability objects with no source
 * (`StackData.inherent`), and are shown as "The initiative". The venture itself is `rules/dungeon.ts`.
 *
 * Taking the initiative when a player already has it changes nothing but still triggers the venture (CR 726.5). The designation belongs to the player: it stays when whatever gave it
 * leaves the battlefield. When the player who has it leaves the game the active player takes it as that player leaves (CR 726.4: so that player ventures), or the next player in turn
 * order when the active player is the one leaving (`initiativeAfterLoss`).
 */

import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, seatsInOrder } from '../state/ops';
import type { GameState, PendingTrigger, TriggeredAbility } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { objectOrLki } from './source-info';

const YOU = { kind: 'you' } as const;

/**
 * CR 726.2: "At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity." The trigger is a record of the rule: the pending trigger is
 * made directly (`findInitiativeTriggers`), nothing reads the `trigger` of an inherent ability but the stack display.
 */
export const INITIATIVE_UPKEEP_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  effect: { kind: 'venture', player: YOU, dungeon: 'undercity' },
};

/**
 * CR 726.2: "Whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the controller of those creatures takes the initiative." The
 * player is the trigger's player (`triggerPlayer`): one trigger for each player whose creatures dealt the damage, whatever the number of creatures.
 */
export const INITIATIVE_STEAL_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'dealsCombatDamage', what: { types: ['creature'] }, to: 'player' },
  effect: { kind: 'takeInitiative', player: { kind: 'triggerPlayer' } },
};

/** CR 726.2: "Whenever a player takes the initiative, that player ventures into Undercity." (`upkeep` of each player stands for the trigger on the stack, nothing evaluates it.) */
export const INITIATIVE_TAKEN_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'each' },
  effect: { kind: 'venture', player: YOU, dungeon: 'undercity' },
};

/** The text an initiative ability shows on the stack: the full texts of CR 726.2. */
export const INITIATIVE_TEXT: Readonly<
  Record<'initiativeUpkeep' | 'initiativeSteal' | 'initiativeTaken', string>
> = {
  initiativeUpkeep:
    'At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity.',
  initiativeSteal:
    'Whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the controller of those creatures takes the initiative.',
  initiativeTaken: 'Whenever a player takes the initiative, that player ventures into Undercity.',
};

/**
 * `seat` takes the initiative (CR 726.1, 726.3, 726.5): the player who had it ceases to. A player who already has it takes it again: the event is emitted and the venture triggers
 * (CR 726.5), but nothing else changes. Nothing happens for a player who has left the game.
 */
export function takeInitiative(
  state: GameState,
  seat: SeatId,
): { readonly state: GameState; readonly events: GameEvent[] } {
  if (getSeat(state, seat).hasLost) return { state, events: [] };
  return {
    state: { ...state, initiative: seat },
    events: [{ kind: 'initiativeTaken', seat, from: state.initiative ?? null }],
  };
}

/**
 * CR 726.4: the player who has the initiative left the game, so the active player takes it at the same time; if the active player is the one leaving (or there is none), the next
 * player in turn order who is still in the game does; if there is none the game goes on with no initiative. Taking it is taking it (CR 726.2: that player ventures). Called where
 * players are marked as having lost.
 */
export function initiativeAfterLoss(state: GameState): {
  readonly state: GameState;
  readonly events: GameEvent[];
} {
  const holder = state.initiative;
  if (holder === undefined || !getSeat(state, holder).hasLost) return { state, events: [] };
  const active = state.turn.activeSeat;
  const next = !getSeat(state, active).hasLost
    ? active
    : (seatsInOrder(state, (active + 1) % state.seats.length)[0] ?? null);
  if (next === null) {
    const { initiative: _gone, ...rest } = state;
    return { state: rest, events: [] };
  }
  return {
    state: { ...state, initiative: next },
    events: [{ kind: 'initiativeTaken', seat: next, from: holder }],
  };
}

/** Whether the object is a creature, as it is or as it last was (CR 113.7a). */
function isCreature(state: GameState, id: string): boolean {
  const live = state.objects[id as never];
  if (live !== undefined) return derive(state, live).types.includes('creature');
  return state.lki[id as never]?.characteristics.types.includes('creature') === true;
}

/** Who controls the object that dealt damage, as it is or as it last was (CR 113.7a). Null when nothing is known of it. */
function controllerOfDealer(state: GameState, id: string): SeatId | null {
  const obj = objectOrLki(state, id as never);
  return obj === null ? null : controllerOf(state, obj);
}

function pending(
  inherent: 'initiativeUpkeep' | 'initiativeSteal' | 'initiativeTaken',
  ability: TriggeredAbility,
  controller: SeatId,
  rest: Partial<PendingTrigger> = {},
): PendingTrigger {
  return { source: null, inherent, controller, abilityIndex: -1, ability, subject: null, ...rest };
}

/**
 * The inherent triggers of the initiative (CR 726.2) that the events cause: the upkeep of the player who has it begins, creatures a player controls deal combat damage to the
 * player who has it, or a player takes it. The first two are controlled by the player who has the initiative as they trigger; the venture of a player who takes it, by that player.
 */
export function findInitiativeTriggers(
  state: GameState,
  events: readonly GameEvent[],
): PendingTrigger[] {
  const holder = state.initiative;
  const found: PendingTrigger[] = [];
  // CR 603.2c: "one or more creatures a player controls" is one occurrence for each player, however many of their creatures dealt the damage in this batch.
  const stealers: SeatId[] = [];
  for (const e of events) {
    if (e.kind === 'initiativeTaken') {
      found.push(pending('initiativeTaken', INITIATIVE_TAKEN_ABILITY, e.seat));
      continue;
    }
    if (holder === undefined) continue;
    if (e.kind === 'stepBegan' && e.step === 'upkeep' && e.seat === holder) {
      found.push(pending('initiativeUpkeep', INITIATIVE_UPKEEP_ABILITY, holder));
    } else if (
      e.kind === 'damageDealt' &&
      e.combat &&
      e.amount > 0 &&
      e.to.kind === 'player' &&
      e.to.seat === holder &&
      isCreature(state, e.source)
    ) {
      const dealer = controllerOfDealer(state, e.source);
      if (dealer !== null && !stealers.includes(dealer)) stealers.push(dealer);
    }
  }
  for (const dealer of stealers) {
    if (holder === undefined) break;
    found.push(pending('initiativeSteal', INITIATIVE_STEAL_ABILITY, holder, { player: dealer }));
  }
  return found;
}

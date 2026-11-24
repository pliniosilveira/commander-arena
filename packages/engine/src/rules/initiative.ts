/**
 * The initiative (CR 726): a designation a player can have. At most one player has it (`GameState.initiative`, CR 726.3), and there is none until an effect instructs a player to
 * take it (CR 726.1). It is built as the monarch is (`monarch.ts`).
 *
 * Three inherent triggered abilities go with it (CR 726.2). They have no source and are controlled by the player who had the initiative as they triggered (an exception to
 * CR 113.8): `findInitiativeTriggers` makes them pending triggers with no `source`, they go on the stack like any other (CR 603.3), as an ability object with no source
 * (`StackData.inherent`), shown as "The initiative":
 * - at the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity (`initiativeUpkeep`);
 * - whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the controller of those creatures takes the initiative
 *   (`initiativeDamage`; one ability for each player whose creatures dealt damage, so with three or more seats each of them takes it in turn);
 * - whenever a player takes the initiative, that player ventures into Undercity (`initiativeTaken`). A player who has it and takes it again triggers it too, and does not get a
 *   second designation (CR 726.5).
 *
 * When the player who has the initiative leaves the game, the active player takes it at the same time; if that player is leaving, or there is none, the next player in turn order
 * does (CR 726.4, `initiativeAfterLoss`).
 */

import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, seatsInOrder } from '../state/ops';
import type { GameState, PendingTrigger, TriggeredAbility } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** The trigger of an inherent ability is never read: `findInitiativeTriggers` makes the pending trigger from the events. */
const NEVER_READ: TriggeredAbility['trigger'] = { kind: 'endStep', whose: 'you' };

/** CR 726.2: "At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity." */
export const INITIATIVE_UPKEEP_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: NEVER_READ,
  effect: { kind: 'ventureIntoDungeon', dungeon: 'undercity' },
};

/** CR 726.2: "Whenever a player takes the initiative, that player ventures into Undercity." */
export const INITIATIVE_TAKEN_ABILITY: TriggeredAbility = INITIATIVE_UPKEEP_ABILITY;

/**
 * CR 726.2: "Whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the controller of those creatures takes the
 * initiative." The player is the one the event is about (`triggerPlayer`).
 */
export const INITIATIVE_DAMAGE_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: NEVER_READ,
  effect: { kind: 'takeInitiative', player: { kind: 'triggerPlayer' } },
};

/** The text an initiative ability shows on the stack: the Oracle text of the initiative, split as its three abilities are. */
export const INITIATIVE_TEXT: Readonly<
  Record<'initiativeUpkeep' | 'initiativeDamage' | 'initiativeTaken', string>
> = {
  initiativeUpkeep: 'At the beginning of your upkeep, venture into Undercity.',
  initiativeDamage:
    'Whenever one or more creatures a player controls deal combat damage to you, that player takes the initiative.',
  initiativeTaken: 'Whenever you take the initiative, venture into Undercity.',
};

/**
 * `seat` takes the initiative (CR 726.1, 726.3, 726.5): the player who had it ceases to. Nothing moves when `seat` has it already, but the taking is still an event, which
 * triggers "Whenever a player takes the initiative" (CR 726.5). Nothing happens when `seat` has left the game.
 */
export function takeInitiative(
  state: GameState,
  seat: SeatId,
): { readonly state: GameState; readonly events: GameEvent[] } {
  if (getSeat(state, seat).hasLost) return { state, events: [] };
  const from = state.initiative ?? null;
  const events: GameEvent[] = [];
  if (from !== seat) events.push({ kind: 'initiativeChanged', from, to: seat });
  events.push({ kind: 'initiativeTaken', seat });
  return { state: { ...state, initiative: seat }, events };
}

/**
 * CR 726.4: the player who has the initiative left the game, so the active player takes it at the same time; if the active player is the one leaving (or no one is active),
 * the next player in turn order who is still in the game does; if there is none, the game goes on with no initiative. Called where players are marked as having lost. The
 * player who takes it this way takes it as a player does (CR 726.2: they venture into Undercity).
 */
export function initiativeAfterLoss(state: GameState): {
  readonly state: GameState;
  readonly events: GameEvent[];
} {
  const holder = state.initiative ?? null;
  if (holder === null || !getSeat(state, holder).hasLost) return { state, events: [] };
  const active = state.turn.activeSeat;
  const next = !getSeat(state, active).hasLost
    ? active
    : (seatsInOrder(state, (active + 1) % state.seats.length)[0] ?? null);
  if (next === null) {
    return {
      state: { ...state, initiative: null },
      events: [{ kind: 'initiativeChanged', from: holder, to: null }],
    };
  }
  return {
    state: { ...state, initiative: next },
    events: [
      { kind: 'initiativeChanged', from: holder, to: next },
      { kind: 'initiativeTaken', seat: next },
    ],
  };
}

/** Whether the object is a creature, as it is or as it last was (CR 113.7a). */
function isCreature(state: GameState, id: string): boolean {
  const live = state.objects[id as never];
  if (live !== undefined) return derive(state, live).types.includes('creature');
  return state.lki[id as never]?.characteristics.types.includes('creature') === true;
}

/** Who controls the creature that dealt damage: now, or as it last was if it has left the battlefield (CR 608.2h). */
function controllerOfSource(state: GameState, id: string): SeatId | null {
  const live = state.objects[id as never];
  if (live !== undefined) return controllerOf(state, live);
  return state.lki[id as never]?.object.controller ?? null; // stored controller: frozen as it left
}

function pending(
  inherent: PendingTrigger['inherent'],
  ability: TriggeredAbility,
  controller: SeatId,
  extra: Partial<PendingTrigger> = {},
): PendingTrigger {
  return {
    source: null,
    ...(inherent === undefined ? {} : { inherent }),
    controller,
    abilityIndex: -1,
    ability,
    subject: null,
    ...extra,
  };
}

/**
 * The inherent triggers of the initiative (CR 726.2) that the events cause: the upkeep of the player who has it begins, one or more creatures a player controls deal combat
 * damage to the player who has it, or a player takes it. The controller of the first two is the player who has it as they trigger; of the third, the player who took it.
 */
export function findInitiativeTriggers(
  state: GameState,
  events: readonly GameEvent[],
): PendingTrigger[] {
  const holder = state.initiative ?? null;
  const found: PendingTrigger[] = [];
  // CR 510.2: the combat damage of one step is dealt at once, so the creatures of one player that deal it count as one event.
  const takers = new Map<SeatId, string>();
  for (const e of events) {
    if (e.kind === 'stepBegan' && e.step === 'upkeep' && e.seat === holder) {
      found.push(pending('initiativeUpkeep', INITIATIVE_UPKEEP_ABILITY, e.seat));
    } else if (e.kind === 'initiativeTaken') {
      found.push(pending('initiativeTaken', INITIATIVE_TAKEN_ABILITY, e.seat));
    } else if (
      holder !== null &&
      e.kind === 'damageDealt' &&
      e.combat &&
      e.amount > 0 &&
      e.to.kind === 'player' &&
      e.to.seat === holder &&
      isCreature(state, e.source)
    ) {
      const taker = controllerOfSource(state, e.source);
      if (taker !== null && !takers.has(taker)) takers.set(taker, e.source);
    }
  }
  for (const [taker, creature] of takers) {
    found.push(
      pending('initiativeDamage', INITIATIVE_DAMAGE_ABILITY, holder as SeatId, {
        subject: creature as never,
        player: taker,
      }),
    );
  }
  return found;
}

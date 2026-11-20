/**
 * Speed (CR 702.179, 702.178, 704.5aa): a number a player has once a rule or effect sets it (`SeatState.speed`). Players do not have speed until then (CR 702.179b); the engine
 * leaves the field out of the state for a player with none, so a game that never meets the mechanic has the state it always had, and reads it as 0 where an effect refers to
 * speed (CR 702.179f).
 *
 * - Start your engines! (CR 702.179a, 704.5aa) is a state-based action: a player who controls a permanent that has it and has no speed gets speed 1 (`gainStartingSpeeds`, run with
 *   the state-based actions, like Ascend).
 * - The inherent ability of CR 702.179d belongs to no object, as the monarch's do (`rules/monarch.ts`): "Whenever one or more opponents lose life during your turn, if your speed is
 *   less than 4, your speed increases by 1. This ability triggers only once each turn." `findSpeedTriggers` makes it a pending trigger with no source for the player whose turn it is;
 *   the once-a-turn count is `TurnLog.speedTriggered`. The intervening "if" is checked as it triggers and again as it resolves (CR 603.4).
 * - Max speed (CR 702.179e): speed is 4. "Max speed -- [ability]" is read as the ability with that condition (CR 702.178a), by the condition `maxSpeed`.
 */

import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, patchSeat } from '../state/ops';
import type { GameState, PendingTrigger, TriggeredAbility } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { MAX_SPEED, speedOf } from './designations';

/**
 * CR 702.179c: `seat` increases their speed by `amount`: with no speed it becomes `amount`, otherwise it is that much more. It stays within 1 to `MAX_SPEED`.
 * An amount of 0 or less changes nothing.
 */
export function increaseSpeed(
  state: GameState,
  seat: SeatId,
  amount: number,
): { readonly state: GameState; readonly events: GameEvent[] } {
  if (amount <= 0) return { state, events: [] };
  const from = speedOf(state, seat);
  const to = Math.min(MAX_SPEED, from + amount);
  if (to === from) return { state, events: [] };
  return {
    state: patchSeat(state, seat, { speed: to }),
    events: [{ kind: 'speedChanged', seat, from, to }],
  };
}

/**
 * CR 704.5aa, 702.179a: every player who has no speed and controls a permanent with start your engines! gets speed 1. A permanent that lost its abilities does not have it (layer 6,
 * read from `derive`). Returns null when nobody does.
 */
export function gainStartingSpeeds(
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  const waiting = new Set(
    state.seats.filter((s) => !s.hasLost && s.speed === undefined).map((s) => s.id),
  );
  if (waiting.size === 0) return null;
  const starters = new Set<SeatId>();
  for (const obj of Object.values(state.objects)) {
    if (obj.zone !== 'battlefield') continue;
    const seat = controllerOf(state, obj);
    if (!waiting.has(seat) || starters.has(seat)) continue;
    if (
      derive(state, obj).abilities.some(
        (a) => a.kind === 'keyword' && a.keyword.kind === 'startYourEngines',
      )
    ) {
      starters.add(seat);
    }
  }
  let next = state;
  const events: GameEvent[] = [];
  for (const seat of starters) {
    const raised = increaseSpeed(next, seat, 1);
    next = raised.state;
    events.push(...raised.events);
  }
  return events.length === 0 ? null : { state: next, events };
}

/** CR 702.179d: the intervening "if" is "your speed is less than 4". */
export const SPEED_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'lifeLost', who: 'opponent' },
  interveningIf: { kind: 'not', term: { kind: 'maxSpeed', player: { kind: 'you' } } },
  effect: { kind: 'increaseSpeed', player: { kind: 'you' }, amount: 1 },
};

/** The text the inherent speed ability shows on the stack: CR 702.179d. */
export const SPEED_TEXT: Readonly<Record<'speedUp', string>> = {
  speedUp:
    'Whenever one or more opponents lose life during your turn, if your speed is less than 4, your speed increases by 1. This ability triggers only once each turn.',
};

/**
 * The inherent speed ability (CR 702.179d) that the events trigger: during the turn of a player who has speed 1 to 3, one or more other players lost life (a life total went down, CR
 * 119.3). Once each turn for the player: the turn log remembers it, so a second loss the same turn triggers nothing (all the losses of one batch of events are one occurrence).
 */
export function findSpeedTriggers(
  state: GameState,
  events: readonly GameEvent[],
): { readonly state: GameState; readonly found: PendingTrigger[] } {
  const active = state.turn.activeSeat;
  const speed = speedOf(state, active);
  if (
    speed < 1 ||
    speed >= MAX_SPEED ||
    getSeat(state, active).hasLost ||
    state.turnLog.speedTriggered?.includes(active) === true
  ) {
    return { state, found: [] };
  }
  const lost = events.some((e) => e.kind === 'lifeChanged' && e.seat !== active && e.to < e.from);
  if (!lost) return { state, found: [] };
  return {
    state: {
      ...state,
      turnLog: {
        ...state.turnLog,
        speedTriggered: [...(state.turnLog.speedTriggered ?? []), active],
      },
    },
    found: [
      {
        source: null,
        inherent: 'speedUp',
        controller: active,
        abilityIndex: -1,
        ability: SPEED_ABILITY,
        subject: null,
      },
    ],
  };
}

/**
 * The monarch (CR 725, D-127): a designation a player can have. At most one player is the monarch
 * (`GameState.monarch`, CR 725.3), and there is none until an effect makes a player the monarch (CR 725.1).
 *
 * Two inherent triggered abilities go with it (CR 725.2): "At the beginning of the monarch's end step, that player
 * draws a card" and "Whenever a creature deals combat damage to the monarch, its controller becomes the
 * monarch". They have no source and are controlled by the player who was the monarch when they triggered (an
 * exception to CR 113.8): `findMonarchTriggers` makes them pending triggers with no `source`, they go on the stack
 * like any other (CR 603.3), as an ability object with no source (`StackData.inherent`), and they are shown as
 * "The monarch". They resolve whoever the monarch is by then (a monarch who lost the designation in response still
 * draws).
 *
 * The designation stays when whatever made a player the monarch leaves the battlefield: it belongs to the player.
 * When the monarch leaves the game the designation passes at once (CR 725.4, `monarchAfterLoss`).
 */

import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, getSeat, seatsInOrder } from '../state/ops';
import type { GameState, PendingTrigger, TriggeredAbility } from '../state/types';
import { derive } from './derive';

/** CR 725.2: "At the beginning of the monarch's end step, that player draws a card." */
export const MONARCH_DRAW_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'you' },
  effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
};

/**
 * CR 725.2: "Whenever a creature deals combat damage to the monarch, its controller becomes the monarch." The
 * creature is the trigger's subject, and its controller is read from last-known information if it has left the
 * battlefield (CR 608.2h).
 */
export const MONARCH_STEAL_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: {
    kind: 'dealsCombatDamage',
    what: { types: ['creature'] },
    to: 'player',
  },
  effect: {
    kind: 'becomeMonarch',
    player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
  },
};

/** The text a monarch ability shows on the stack: the full texts of CR 725.2. */
export const MONARCH_TEXT: Readonly<Record<'monarchDraw' | 'monarchSteal', string>> = {
  monarchDraw: "At the beginning of the monarch's end step, that player draws a card.",
  monarchSteal:
    'Whenever a creature deals combat damage to the monarch, its controller becomes the monarch.',
};

/**
 * `seat` becomes the monarch (CR 725.3): the current monarch ceases to be it. Nothing happens when `seat` already is
 * the monarch (it does not become it again) or has left the game (CR 725.4: only a player in the game can be it).
 */
export function becomeMonarch(
  state: GameState,
  seat: SeatId,
): { readonly state: GameState; readonly events: GameEvent[] } {
  if (state.monarch === seat || getSeat(state, seat).hasLost) return { state, events: [] };
  return {
    state: withMonarch(state, seat),
    events: [{ kind: 'monarchChanged', from: state.monarch, to: seat }],
  };
}

/**
 * The designation moves to `seat`, which becomes the monarch now (CR 725.3, 725.4): the moment is stamped (CR 610.3b) and the cards exiled "until an opponent becomes the monarch" by
 * a player other than `seat` are released (D-231; `rules/exile-return.ts` returns them as `settle` runs, CR 610.3).
 */
function withMonarch(state: GameState, seat: SeatId | null): GameState {
  if (seat === null) return { ...state, monarch: null };
  const [stamp, stamped] = allocateTimestamp(state);
  return {
    ...stamped,
    monarch: seat,
    monarchBecameAt: { ...(state.monarchBecameAt ?? {}), [seat]: stamp },
    exileReturns: state.exileReturns.map((r) =>
      r.untilMonarch === true && r.controller !== seat ? { ...r, released: true as const } : r,
    ),
  };
}

/**
 * CR 725.4: the monarch left the game, so the active player becomes the monarch at the same time; if the active
 * player is the one leaving (or no one is active), the next player in turn order who is still in the game does;
 * if there is none, the game goes on with no monarch. Called where players are marked as having lost.
 */
export function monarchAfterLoss(state: GameState): {
  readonly state: GameState;
  readonly events: GameEvent[];
} {
  const monarch = state.monarch;
  if (monarch === null || !getSeat(state, monarch).hasLost) return { state, events: [] };
  const active = state.turn.activeSeat;
  const next = !getSeat(state, active).hasLost
    ? active
    : (seatsInOrder(state, (active + 1) % state.seats.length)[0] ?? null);
  return {
    state: withMonarch(state, next),
    events: [{ kind: 'monarchChanged', from: monarch, to: next }],
  };
}

/** Whether the object is a creature, as it is or as it last was (CR 113.7a). */
function isCreature(state: GameState, id: string): boolean {
  const live = state.objects[id as never];
  if (live !== undefined) return derive(state, live).types.includes('creature');
  return state.lki[id as never]?.characteristics.types.includes('creature') === true;
}

/**
 * The inherent triggers of the monarch (CR 725.2) that the events cause: the end step of the monarch's turn
 * begins, or a creature deals combat damage to the monarch. The controller of both is the monarch as they trigger.
 */
export function findMonarchTriggers(
  state: GameState,
  events: readonly GameEvent[],
): PendingTrigger[] {
  const monarch = state.monarch;
  if (monarch === null) return [];
  const found: PendingTrigger[] = [];
  for (const e of events) {
    if (e.kind === 'stepBegan' && e.step === 'end' && e.seat === monarch) {
      found.push({
        source: null,
        inherent: 'monarchDraw',
        controller: monarch,
        abilityIndex: -1,
        ability: MONARCH_DRAW_ABILITY,
        subject: null,
      });
    } else if (
      e.kind === 'damageDealt' &&
      e.combat &&
      e.amount > 0 &&
      e.to.kind === 'player' &&
      e.to.seat === monarch &&
      isCreature(state, e.source)
    ) {
      found.push({
        source: null,
        inherent: 'monarchSteal',
        controller: monarch,
        abilityIndex: -1,
        ability: MONARCH_STEAL_ABILITY,
        subject: e.source,
      });
    }
  }
  return found;
}

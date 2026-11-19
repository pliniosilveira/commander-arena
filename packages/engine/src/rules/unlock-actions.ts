/**
 * Unlocking a half of a Room (CR 709.5e, 709.5f, 709.5h, 116): the special action, and the designation it gives.
 *
 * It is taken as the special action of turning a face-down permanent face up is (`rules/face-down-actions.ts`): the choice is a priority option and an action (`unlockDoor`), the
 * cost is a `payMana` decision (purpose `unlockDoor`, the permanent as `source`, the half as `door`) answered with `payAuto` or `payManual`, and `cancel` gives priority back
 * with nothing changed. The permanent is the same object afterwards (no zone change); it is given the unlocked designation (CR 709.5e), which makes the half's name, mana cost
 * and rules text count (CR 709.5) and triggers the abilities of "When you unlock this door" (CR 709.5h: the `doorUnlocked` event). The same player has priority again (CR 116.1).
 */
import type { ObjectId, SeatId } from '../ids';
import type { PayManaDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getObject, setObject } from '../state/ops';
import type { GameState } from '../state/types';
import { applyPaymentPlan, payableSources, planFor } from './mana-engine';
import { type ManualTap, payByTapping } from './pay-manual';
import { grantPriority, priorityOptions } from './priority';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';
import { canUnlockDoor, unlockSymbols } from './unlock-legality';

/**
 * CR 709.5f, 709.5h: gives the Room `object` the unlocked designation of the half `door` and says so (`doorUnlocked`, by `seat`, with the mana paid as its `cost`). Nothing
 * happens to a half that is already unlocked.
 */
export function giveUnlockedDesignation(
  state: GameState,
  seat: SeatId,
  object: ObjectId,
  door: number,
  cost: readonly string[],
): { state: GameState; events: GameEvent[] } {
  const obj = getObject(state, object);
  if (obj.unlockedDoors?.includes(door) === true) return { state, events: [] };
  const unlockedDoors = [...(obj.unlockedDoors ?? []), door].sort((a, b) => a - b);
  return {
    state: setObject(state, { ...obj, unlockedDoors }),
    events: [{ kind: 'doorUnlocked', seat, object, door, cost }],
  };
}

/**
 * The player chose the special action: asks for the payment, or unlocks the half at once when it costs nothing. `isOffered` has checked the choice against the priority options;
 * the legality is checked again here, as the state is the one the options were listed from.
 */
export function beginUnlockDoor(
  state: GameState,
  seat: SeatId,
  object: ObjectId,
  door: number,
): Result {
  const obj = state.objects[object];
  if (obj === undefined || !canUnlockDoor(state, seat, obj, door)) {
    return fail('That half cannot be unlocked now');
  }
  const symbols = unlockSymbols(state, obj, door) ?? [];
  if (symbols.length === 0) {
    return takeUnlockDoor({ ...state, pending: null }, seat, object, door, [], []);
  }
  const decision: Omit<PayManaDecision, 'id'> = {
    kind: 'payMana',
    seat,
    source: object,
    totalCost: symbols,
    manaSources: payableSources(state, seat),
    purpose: 'unlockDoor',
    door,
  };
  return ok(setPending(state, decision), []);
}

/** The answer to the payment: `cancel` gives priority back with the same options (nothing was paid); a payment that does not cover the cost changes nothing. */
export function answerUnlockDoorPayment(
  state: GameState,
  seat: SeatId,
  d: PayManaDecision,
  action:
    | { readonly kind: 'cancel' }
    | { readonly kind: 'payAuto' }
    | { readonly kind: 'payManual'; readonly taps: readonly ManualTap[] },
): Result {
  if (action.kind === 'cancel') {
    const open = { ...state, pending: null };
    return ok(
      setPending(open, { kind: 'priority', seat, options: priorityOptions(open, seat) }),
      [],
    );
  }
  if (d.door === undefined) return fail('The unlock decision has no half');
  const symbols = d.totalCost;
  let paid: { state: GameState; events: GameEvent[] };
  if (action.kind === 'payManual') {
    const r = payByTapping(state, seat, symbols, { ability: true }, action.taps);
    if ('error' in r) return fail(r.error);
    paid = r;
  } else {
    const plan = planFor(state, seat, symbols, { ability: true });
    if (plan === null) return fail('You cannot pay that cost');
    paid = applyPaymentPlan(state, seat, plan, plan.lifePaid);
  }
  return takeUnlockDoor(
    { ...paid.state, pending: null },
    seat,
    d.source,
    d.door,
    symbols,
    paid.events,
  );
}

/** The cost is paid: the half is unlocked (CR 709.5e) and its controller has priority again (CR 116.1). */
function takeUnlockDoor(
  state: GameState,
  seat: SeatId,
  object: ObjectId,
  door: number,
  cost: readonly string[],
  paidEvents: readonly GameEvent[],
): Result {
  const unlocked = giveUnlockedDesignation(state, seat, object, door, cost);
  const events: GameEvent[] = [...paidEvents, ...unlocked.events];
  const next = {
    ...unlocked.state,
    pending: null,
    turn: { ...unlocked.state.turn, passedInSuccession: [] },
  };
  const granted = grantPriority(next, seat, events);
  return ok(granted.state, [...events, ...granted.events]);
}

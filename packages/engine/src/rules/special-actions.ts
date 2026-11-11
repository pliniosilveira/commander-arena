/**
 * Taking the special actions of Suspend and Foretell (CR 116.2f, 116.2h, 702.62a, 702.143a, D-128).
 *
 * A special action does not use the stack (CR 116.1): the player pays the cost and the card is exiled at once, and
 * the player keeps priority. The cost is mana, so the action asks for it with a `payMana` decision (purpose
 * `suspend` or `foretell`, the card in the hand as `source`) exactly as an attack tax is paid (D-125): `payAuto` or
 * `payManual` pays and takes the action; `cancel` takes nothing, and nothing has happened, so it gives priority back.
 * A cost of {0} (Suspend 4-{0}) needs no payment and the action is taken at once.
 *
 * - Suspend: the card goes to exile face up with N time counters (`suspended` event, then the `counterAdded` event).
 *   Its upkeep and cast abilities are found from there (`rules/later-triggers.ts`).
 * - Foretell: the card goes to exile face down, and remembers the turn it was foretold in (`GameObject.foretoldTurn`):
 *   it may be cast from there for its foretell cost in a later turn. The `foretold` event says nothing about the card.
 */
import type { ObjectId, SeatId } from '../ids';
import type { PayManaDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getObject, patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { faceOf } from './legality';
import { applyPaymentPlan, payableSources, planFor } from './mana-engine';
import { type ManualTap, payByTapping } from './pay-manual';
import { grantPriority, priorityOptions } from './priority';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';
import {
  canForetell,
  canSuspend,
  FORETELL_ACTION_COST,
  suspendOf,
  suspendSymbols,
} from './special-legality';
import { moveObject } from './zones';

export type SpecialKind = 'suspend' | 'foretell';

/** The mana of the action: the suspend cost of the card, or {2} (CR 702.143a). */
function costOf(state: GameState, kind: SpecialKind, object: ObjectId): readonly string[] {
  if (kind === 'foretell') return FORETELL_ACTION_COST;
  return suspendSymbols(state, getObject(state, object)) ?? [];
}

function allowed(state: GameState, seat: SeatId, kind: SpecialKind, object: ObjectId): boolean {
  const obj = state.objects[object];
  if (obj === undefined) return false;
  return kind === 'suspend' ? canSuspend(state, seat, obj) : canForetell(state, seat, obj);
}

/**
 * The player chose the special action: asks for the payment, or takes the action at once when it costs nothing.
 * `isOffered` has checked the choice against the priority options; the legality is checked again here, as the
 * state is the one the options were listed from.
 */
export function beginSpecialAction(
  state: GameState,
  seat: SeatId,
  kind: SpecialKind,
  object: ObjectId,
): Result {
  if (!allowed(state, seat, kind, object)) {
    return fail(
      kind === 'suspend' ? 'That card cannot be suspended now' : 'That card cannot be foretold now',
    );
  }
  const symbols = costOf(state, kind, object);
  if (symbols.length === 0)
    return takeSpecialAction({ ...state, pending: null }, seat, kind, object, []);
  const decision: Omit<PayManaDecision, 'id'> = {
    kind: 'payMana',
    seat,
    source: object,
    totalCost: symbols,
    manaSources: payableSources(state, seat),
    purpose: kind,
  };
  return ok(setPending(state, decision), []);
}

/**
 * The answer to the payment of a special action. `cancel` gives priority back with the same options (nothing was paid
 * or moved); a payment that does not cover the cost changes nothing and the question stays.
 */
export function answerSpecialPayment(
  state: GameState,
  seat: SeatId,
  d: PayManaDecision & { readonly purpose: 'suspend' | 'foretell' },
  action:
    | { readonly kind: 'cancel' }
    | { readonly kind: 'payAuto' }
    | { readonly kind: 'payManual'; readonly taps: readonly ManualTap[] },
): Result {
  const kind = d.purpose;
  if (action.kind === 'cancel') {
    const open = { ...state, pending: null };
    return ok(
      setPending(open, { kind: 'priority', seat, options: priorityOptions(open, seat) }),
      [],
    );
  }
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
  return takeSpecialAction({ ...paid.state, pending: null }, seat, kind, d.source, paid.events);
}

/** The cost is paid: exile the card (CR 702.62a, 702.143a), then the player gets priority again (CR 116.1). */
function takeSpecialAction(
  state: GameState,
  seat: SeatId,
  kind: SpecialKind,
  object: ObjectId,
  paidEvents: readonly GameEvent[],
): Result {
  const moved = moveObject(state, { object, to: 'exile' });
  if (moved.kind !== 'done' || moved.newObject === null)
    return fail('The card could not be exiled');
  const card = moved.newObject;
  const events: GameEvent[] = [...paidEvents, ...moved.events];
  let next = moved.state;
  if (kind === 'suspend') {
    const count = suspendOf(faceOf(next, getObject(next, card)))?.count ?? 0;
    next = patchObject(next, card, { counters: { time: count } });
    events.push({ kind: 'suspended', seat, object: card, count });
    events.push({ kind: 'counterAdded', object: card, counter: 'time', count });
  } else {
    next = patchObject(next, card, { foretoldTurn: next.turn.number });
    events.push({ kind: 'foretold', seat, object: card });
  }
  // CR 116.1: it does not use the stack; the same player has priority again.
  next = { ...next, pending: null, turn: { ...next.turn, passedInSuccession: [] } };
  const granted = grantPriority(next, seat, events);
  return ok(granted.state, [...events, ...granted.events]);
}

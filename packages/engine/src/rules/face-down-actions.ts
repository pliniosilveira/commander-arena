/**
 * Turning a face-down permanent face up (CR 116.2b, 701.40b, 708.8, D-963): a special action. "Any time you have priority, you may turn a manifested permanent you control
 * face up. This is a special action that doesn't use the stack. To do this, show all players that the card representing that permanent is a creature card and what that card's
 * mana cost is, pay that cost, then turn the permanent face up. ... (If the card representing that permanent isn't a creature card or it doesn't have a mana cost, it can't be
 * turned face up this way.)"
 *
 * It is taken as the special actions of Suspend and Foretell are (`rules/special-actions.ts`): the choice is a priority option and an action (`turnFaceUp`), the cost is a
 * `payMana` decision (purpose `turnFaceUp`, the permanent as `source`) answered with `payAuto` or `payManual`, and `cancel` gives priority back with nothing changed. A cost
 * that needs no mana is taken at once. The permanent is the same object afterwards (CR 708.8: no zone change, so no enters ability triggers and no enters replacement
 * applies); its copiable values revert to the card's own, and what had been applied to it still applies. The same player has priority again (CR 116.1).
 *
 * What the cost is depends on what made the permanent face down (`faceDown.by`): for a manifested one it is the mana cost of the card (CR 701.40b). A morph or disguise
 * cost would be another branch of `turnUpSymbols`.
 */
import type { ObjectId, SeatId } from '../ids';
import type { PayManaDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getObject, setObject } from '../state/ops';
import type { GameState } from '../state/types';
import { withoutFaceDown } from './face-down';
import { canTurnFaceUp, turnUpSymbols } from './face-down-legality';
import { applyPaymentPlan, payableSources, planFor } from './mana-engine';
import { type ManualTap, payByTapping } from './pay-manual';
import { grantPriority, priorityOptions } from './priority';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';

/**
 * The player chose the special action: asks for the payment, or turns the permanent face up at once when it costs nothing. `isOffered` has checked the choice against the
 * priority options; the legality is checked again here, as the state is the one the options were listed from.
 */
export function beginTurnFaceUp(state: GameState, seat: SeatId, object: ObjectId): Result {
  const obj = state.objects[object];
  if (obj === undefined || !canTurnFaceUp(state, seat, obj)) {
    return fail('That permanent cannot be turned face up now');
  }
  const symbols = turnUpSymbols(state, obj) ?? [];
  if (symbols.length === 0)
    return takeTurnFaceUp({ ...state, pending: null }, seat, object, [], []);
  const decision: Omit<PayManaDecision, 'id'> = {
    kind: 'payMana',
    seat,
    source: object,
    totalCost: symbols,
    manaSources: payableSources(state, seat),
    purpose: 'turnFaceUp',
  };
  return ok(setPending(state, decision), []);
}

/** The answer to the payment: `cancel` gives priority back with the same options (nothing was paid); a payment that does not cover the cost changes nothing. */
export function answerTurnFaceUpPayment(
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
  return takeTurnFaceUp({ ...paid.state, pending: null }, seat, d.source, symbols, paid.events);
}

/** The cost is paid: the permanent is turned face up (CR 708.8) and its controller has priority again (CR 116.1). */
function takeTurnFaceUp(
  state: GameState,
  seat: SeatId,
  object: ObjectId,
  cost: readonly string[],
  paidEvents: readonly GameEvent[],
): Result {
  const obj = getObject(state, object);
  if (obj.card === null) return fail('That permanent has no card');
  const events: GameEvent[] = [
    ...paidEvents,
    { kind: 'turnedFaceUp', seat, object, card: obj.card, cost },
  ];
  // CR 708.8: the same object, its copiable values back to the card's own; counters, damage, attachments, timestamps and the effects applied to it are unchanged.
  let next = setObject(state, withoutFaceDown(obj));
  next = { ...next, pending: null, turn: { ...next.turn, passedInSuccession: [] } };
  const granted = grantPriority(next, seat, events);
  return ok(granted.state, [...events, ...granted.events]);
}

/**
 * The companion (CR 103.2b, 116.2g, 702.139): a card a player revealed from outside the game before it began.
 *
 * - The card stays outside the game until it is brought: it is no object, in no zone, and counts neither in the
 *   100 cards of the deck (CR 903.5a) nor in the library. `SeatState.companion` records which card it is
 *   (an index into `GameState.definitions`, so the state stays JSON) and whether it was brought. It is public.
 * - Bringing it (CR 116.2g, 702.139a) is a special action: once per game, any time the player has priority with an
 *   empty stack in a main phase of their own turn, they pay {3} and put it into their hand. It does not use the stack
 *   (CR 116.1), so nothing can be done in response and the player keeps priority.
 * - From then on it is an ordinary card of the game (CR 702.139c, 702.139d): the hand holds a new object of it
 *   (CR 400.7), with a card of its own, and the card never goes back outside the game.
 * - The cost is paid by the payment planner, like every other automatic payment (ROADMAP: no choice of sources yet).
 */
import type { CardId, SeatId } from '../ids';
import { cardId } from '../ids';
import { addToZone, allocateObjectId, allocateTimestamp, patchSeat, setObject } from '../state/ops';
import type { GameState } from '../state/types';
import { applyPaymentPlan, planFor } from './mana-engine';
import { grantPriority } from './priority';
import { fail, ok, type Result } from './result';
import { COMPANION_ACTION_COST, canBringCompanion } from './special-legality';

/** The next free card id: cards are numbered from 0 and a companion card joins the game after all of them. */
function nextCardId(state: GameState): CardId {
  let next = 0;
  for (const id of Object.keys(state.cards)) next = Math.max(next, Number(id.slice(1)) + 1);
  return cardId(next);
}

/** CR 116.2g, 702.139a, 400.7: pays {3}, puts a new object of the companion into the hand, marks it brought, and gives priority back. */
export function bringCompanion(state: GameState, seat: SeatId): Result {
  const companion = state.seats[seat]?.companion;
  if (companion === undefined || !canBringCompanion(state, seat)) {
    return fail('You cannot bring your companion into your hand now');
  }
  const plan = planFor(state, seat, COMPANION_ACTION_COST, { ability: true });
  if (plan === null) return fail('You cannot pay that cost');
  const paid = applyPaymentPlan(state, seat, plan, plan.lifePaid);
  const card = nextCardId(paid.state);
  const [id, s1] = allocateObjectId(paid.state);
  const [timestamp, s2] = allocateTimestamp(s1);
  let next: GameState = {
    ...s2,
    cards: {
      ...s2.cards,
      [card]: { id: card, owner: seat, definition: companion.definition, isCommander: false },
    },
  };
  next = setObject(next, {
    id,
    card,
    zone: 'hand',
    zoneOwner: seat,
    owner: seat,
    controller: seat,
    face: 0,
    tapped: false,
    counters: {},
    damage: 0,
    damagedByDeathtouch: false,
    timestamp,
    token: null,
    attachedTo: null,
    protector: null,
    stack: null,
  });
  next = addToZone(next, 'hand', seat, id);
  next = patchSeat(next, seat, { companion: { ...companion, brought: true } });
  const events = [...paid.events, { kind: 'companionBrought' as const, seat, object: id }];
  // CR 116.1: it does not use the stack; the same player has priority again.
  next = { ...next, pending: null, turn: { ...next.turn, passedInSuccession: [] } };
  const granted = grantPriority(next, seat, events);
  return ok(granted.state, [...events, ...granted.events]);
}

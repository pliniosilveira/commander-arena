/**
 * Small immutable helpers over GameState. Every function returns a new state that shares
 * unchanged subtrees with the old one (SPEC 17.1 A6). Nothing here knows any game rule.
 */
import type { Zone } from '../ast/types';
import type { CardDefinition } from '../cards/definition';
import type { CardId, ObjectId, SeatId } from '../ids';
import { objectId } from '../ids';
import type { GameObject, GameState, SeatState } from './types';

export function getObject(state: GameState, id: ObjectId): GameObject {
  const obj = state.objects[id];
  if (!obj) throw new Error(`Unknown object ${id}`);
  return obj;
}

/**
 * The card whose face `obj` shows (D-129): its own card, or for a copy of a spell on the stack the card that spell
 * copies (a copy is not a card, CR 707.10, so `card` is null but it has the characteristics and the spell text of
 * that face). Null for a token and for an ability on the stack.
 */
export function printedCard(obj: GameObject): CardId | null {
  return obj.card ?? obj.copyOf ?? null;
}

export function getSeat(state: GameState, seat: SeatId): SeatState {
  const s = state.seats[seat];
  if (!s) throw new Error(`Unknown seat ${seat}`);
  return s;
}

export function definitionOf(state: GameState, card: CardId): CardDefinition {
  const instance = state.cards[card];
  if (!instance) throw new Error(`Unknown card ${card}`);
  const def = state.definitions[instance.definition];
  if (!def) throw new Error(`Unknown definition ${instance.definition}`);
  return def;
}

export function setObject(state: GameState, obj: GameObject): GameState {
  return { ...state, objects: { ...state.objects, [obj.id]: obj } };
}

export function patchObject(state: GameState, id: ObjectId, patch: Partial<GameObject>): GameState {
  return setObject(state, { ...getObject(state, id), ...patch });
}

export function setSeat(state: GameState, seat: SeatState): GameState {
  const seats = state.seats.map((s) => (s.id === seat.id ? seat : s));
  return { ...state, seats };
}

export function patchSeat(state: GameState, seat: SeatId, patch: Partial<SeatState>): GameState {
  return setSeat(state, { ...getSeat(state, seat), ...patch });
}

/**
 * CR 119.3, 119.4: the seat loses `amount` life (damage, a life-loss effect, or life paid as a cost, which
 * is losing that much life), and the loss is recorded in `lifeLostThisTurn` for the cards that ask "if an
 * opponent lost life this turn" (D-124, Spectacle, CR 702.137a). Every reduction of a life total goes
 * through here; a loss of 0 or less changes nothing. Gaining life is not a loss and is not recorded.
 */
export function loseLifeBy(state: GameState, seat: SeatId, amount: number): GameState {
  if (amount <= 0) return state;
  const s = getSeat(state, seat);
  return setSeat(state, {
    ...s,
    life: s.life - amount,
    lifeLostThisTurn: s.lifeLostThisTurn + amount,
  });
}

/** Allocates a fresh ObjectId (CR 400.7: every zone change makes a new object). */
export function allocateObjectId(state: GameState): [ObjectId, GameState] {
  const id = objectId(state.nextObjectNumber);
  return [id, { ...state, nextObjectNumber: state.nextObjectNumber + 1 }];
}

export function allocateTimestamp(state: GameState): [number, GameState] {
  return [state.nextTimestamp, { ...state, nextTimestamp: state.nextTimestamp + 1 }];
}

type SeatZone = 'library' | 'hand' | 'graveyard' | 'command';
const SEAT_ZONES: readonly Zone[] = ['library', 'hand', 'graveyard', 'command'];

export function isSeatZone(zone: Zone): zone is SeatZone {
  return SEAT_ZONES.includes(zone);
}

/** The ordered list of object ids in a zone. Seat zones need the seat. */
export function zoneList(state: GameState, zone: Zone, seat: SeatId | null): readonly ObjectId[] {
  if (isSeatZone(zone)) {
    if (seat === null) throw new Error(`Zone ${zone} needs a seat`);
    return getSeat(state, seat)[zone];
  }
  if (zone === 'battlefield') return state.battlefield;
  if (zone === 'exile') return state.exile;
  if (zone === 'phased') return state.phased ?? [];
  return state.stack;
}

/** Replaces the list of one zone. */
export function withZoneList(
  state: GameState,
  zone: Zone,
  seat: SeatId | null,
  list: readonly ObjectId[],
): GameState {
  if (isSeatZone(zone)) {
    if (seat === null) throw new Error(`Zone ${zone} needs a seat`);
    return patchSeat(state, seat, { [zone]: list } as Partial<SeatState>);
  }
  if (zone === 'battlefield') return { ...state, battlefield: list };
  if (zone === 'exile') return { ...state, exile: list };
  if (zone === 'phased') return { ...state, phased: list };
  return { ...state, stack: list };
}

/** All object ids currently in a zone (every seat's, for seat zones). */
export function objectsInZone(state: GameState, zone: Zone): readonly ObjectId[] {
  if (zone === 'battlefield' || zone === 'stack' || zone === 'exile' || zone === 'phased') {
    return zoneList(state, zone, null);
  }
  return state.seats.flatMap((s) => zoneList(state, zone, s.id));
}

export function removeFromZone(state: GameState, obj: GameObject): GameState {
  const list = zoneList(state, obj.zone, obj.zoneOwner);
  return withZoneList(
    state,
    obj.zone,
    obj.zoneOwner,
    list.filter((id) => id !== obj.id),
  );
}

/**
 * Adds an id at the top (index 0 for libraries, the end for every other list) or bottom, or (a number N, D-135) "Nth from the top"
 * of a library: below the first N - 1 cards, or on the bottom when the library has fewer than N cards (CR 401.7).
 */
export function addToZone(
  state: GameState,
  zone: Zone,
  seat: SeatId | null,
  id: ObjectId,
  position: 'top' | 'bottom' | number = 'top',
): GameState {
  const list = zoneList(state, zone, seat);
  if (zone === 'library') {
    if (typeof position === 'number') {
      // `slice` past the end gives nothing, so a library of fewer cards than the position puts the card on the bottom.
      const at = Math.max(0, position - 1);
      return withZoneList(state, zone, seat, [...list.slice(0, at), id, ...list.slice(at)]);
    }
    return withZoneList(state, zone, seat, position === 'top' ? [id, ...list] : [...list, id]);
  }
  return withZoneList(state, zone, seat, [...list, id]);
}

/** Seats still in the game, in turn order starting after `from` (CR 101.4 APNAP uses this order). */
export function seatsInOrder(state: GameState, from: SeatId): SeatId[] {
  const n = state.seats.length;
  const order: SeatId[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = (from + i) % n;
    if (!getSeat(state, id).hasLost) order.push(id);
  }
  return order;
}

/** Seats other than `seat` that are still in the game: "each opponent" (CR 102.2 for two seats, general here). */
export function opponentsOf(state: GameState, seat: SeatId): SeatId[] {
  return state.seats.filter((s) => s.id !== seat && !s.hasLost).map((s) => s.id);
}

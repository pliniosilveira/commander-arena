/**
 * Starting the game (CR 103, 903.6, 903.7): decks, commanders, the starting player, life totals and
 * the London mulligan.
 */
import type { CardDefinition } from '../cards/definition';
import type { CardId, ObjectId, SeatId } from '../ids';
import { cardId, objectId } from '../ids';
import { createRng, nextInt, shuffle } from '../rng';
import type { GameEvent } from '../state/events';
import { addToZone, getObject, getSeat, patchSeat, removeFromZone, zoneList } from '../state/ops';
import {
  type CardInstance,
  DEFAULT_SETTINGS,
  EMPTY_TURN_LOG,
  type GameObject,
  type GameSettings,
  type GameState,
  type SeatState,
} from '../state/types';
import { ENGINE_VERSION } from '../version';
import { startTurn } from './flow';
import type { Outcome } from './priority';
import { setPending } from './set-pending';

export interface DeckConfig {
  /** All 100 cards, including the commander(s). */
  readonly cards: readonly CardDefinition[];
  /** Indices into `cards` of the commander(s) (CR 903.3, 702.124 for two). */
  readonly commanders: readonly number[];
}

export interface GameConfig {
  readonly seed: number;
  readonly decks: readonly DeckConfig[];
  readonly settings?: Partial<GameSettings>;
}

const OPENING_HAND = 7;

function emptySeat(id: SeatId): SeatState {
  return {
    id,
    life: 0,
    poison: 0,
    library: [],
    hand: [],
    graveyard: [],
    command: [],
    manaPool: [],
    landsPlayedThisTurn: 0,
    cardsDrawnThisTurn: 0,
    spellsCastThisTurn: 0,
    lifeLostThisTurn: 0,
    turnsTaken: 0,
    drewFromEmptyLibrary: false,
    mulligans: 0,
    turnStartTimestamp: 0,
    previousTurnStartTimestamp: 0,
    hasLost: false,
    commanders: [],
    handSizeMax: null,
  };
}

/** Creates a game and stops at the first mulligan decision (CR 103.5). */
export function createGame(config: GameConfig): Outcome {
  if (config.decks.length !== 2) {
    // v1 is one human against one AI. Every rule below is written for any number of seats; the
    // multiplayer pieces (800.4a leaving the game, APNAP around the table) arrive with multiplayer.
    throw new Error('The engine supports exactly two seats');
  }
  const settings: GameSettings = { ...DEFAULT_SETTINGS, ...config.settings };
  const definitions: CardDefinition[] = [];
  const defIndex = new Map<CardDefinition, number>();
  const cards: Record<CardId, CardInstance> = {};
  const objects: Record<ObjectId, GameObject> = {};
  let seats: SeatState[] = config.decks.map((_, i) => emptySeat(i));
  let cardNo = 0;
  let objectNo = 0;
  let stamp = 1;

  config.decks.forEach((deck, seat) => {
    const commanderCards: CardId[] = [];
    deck.cards.forEach((def, i) => {
      let di = defIndex.get(def);
      if (di === undefined) {
        di = definitions.length;
        definitions.push(def);
        defIndex.set(def, di);
      }
      const cid = cardId(cardNo++);
      const isCommander = deck.commanders.includes(i);
      cards[cid] = { id: cid, owner: seat, definition: di, isCommander };
      const oid = objectId(objectNo++);
      const zone = isCommander ? 'command' : 'library';
      objects[oid] = {
        id: oid,
        card: cid,
        zone,
        zoneOwner: seat,
        owner: seat,
        controller: seat,
        face: 0,
        tapped: false,
        counters: {},
        damage: 0,
        damagedByDeathtouch: false,
        timestamp: stamp++,
        token: null,
        attachedTo: null,
        protector: null,
        stack: null,
      };
      seats = seats.map((s) => (s.id === seat ? { ...s, [zone]: [...s[zone], oid] } : s));
      if (isCommander) commanderCards.push(cid);
    });
    seats = seats.map((s) => (s.id === seat ? { ...s, commanders: commanderCards } : s));
  });

  let state: GameState = {
    engineVersion: ENGINE_VERSION,
    settings,
    seed: config.seed,
    rng: createRng(config.seed),
    nextObjectNumber: objectNo,
    nextDecisionNumber: 0,
    nextTimestamp: stamp,
    definitions,
    cards,
    objects,
    seats,
    battlefield: [],
    exile: [],
    stack: [],
    turn: {
      number: 0,
      activeSeat: 0,
      phase: 'beginning',
      step: 'untap',
      prioritySeat: null,
      passedInSuccession: [],
      extraLandDrops: 0,
    },
    commanderCasts: {},
    commanderDamage: {},
    lki: {},
    commanderWatch: [],
    monarch: null,
    turnLog: EMPTY_TURN_LOG,
    pendingTriggers: [],
    delayedTriggers: [],
    exileReturns: [],
    continuousEffects: [],
    casting: null,
    triggering: null,
    combat: null,
    resolution: null,
    actionCount: 0,
    pending: null,
    result: null,
  };

  // CR 103.3: each player shuffles their deck.
  for (const s of state.seats) {
    const [shuffled, rng] = shuffle(zoneList(state, 'library', s.id), state.rng);
    state = patchSeat({ ...state, rng }, s.id, { library: shuffled });
  }
  // CR 103.1: the starting player is chosen at random (seeded).
  const [starter, rng] = nextInt(state.rng, state.seats.length);
  state = { ...state, rng, turn: { ...state.turn, activeSeat: starter } };
  // CR 103.4c, 903.7: starting life 40 once the starting player is determined.
  for (const s of state.seats) state = patchSeat(state, s.id, { life: settings.startingLife });

  const events: GameEvent[] = [{ kind: 'gameStarted', startingSeat: starter, seed: config.seed }];
  for (const s of state.seats) state = drawOpeningHand(state, s.id);
  return { state: askMulligan(state, starter), events };
}

function drawOpeningHand(input: GameState, seat: SeatId): GameState {
  let state = input;
  for (let i = 0; i < OPENING_HAND; i += 1) {
    const top = zoneList(state, 'library', seat)[0];
    if (top === undefined) break;
    state = moveTopToHand(state, seat, top);
  }
  return state;
}

/** Setup moves are not game actions: a plain re-zoning without events or replacement effects. */
function moveTopToHand(state: GameState, seat: SeatId, id: ObjectId): GameState {
  const obj = getObject(state, id);
  let next = removeFromZone(state, obj);
  next = { ...next, objects: { ...next.objects, [id]: { ...obj, zone: 'hand' } } };
  return addToZone(next, 'hand', seat, id);
}

/** CR 103.5c: in a multiplayer game the first mulligan is free; in two-player it is a house rule. */
function free(state: GameState): boolean {
  return state.settings.freeFirstMulligan || state.seats.length > 2;
}

function bottomCountFor(state: GameState, seat: SeatId): number {
  const taken = getSeat(state, seat).mulligans;
  return Math.max(0, taken - (free(state) ? 1 : 0));
}

function askMulligan(state: GameState, seat: SeatId): GameState {
  const s = getSeat(state, seat);
  return setPending(state, {
    kind: 'mulligan',
    seat,
    hand: s.hand,
    bottomCount: bottomCountFor(state, seat),
    // CR 103.5: a player can take mulligans until their opening hand would be zero cards, so the
    // next mulligan must leave at most seven cards to put on the bottom (CR 103.5c: a free first
    // mulligan puts none and does not count toward that number).
    canMulligan: Math.max(0, s.mulligans + 1 - (free(state) ? 1 : 0)) <= OPENING_HAND,
  });
}

/** The seat after `seat` that has not yet kept, in turn order from the starting player; or null. */
function nextMulliganSeat(state: GameState, seat: SeatId): SeatId | null {
  const next = seat + 1 === state.seats.length ? 0 : seat + 1;
  return next === state.turn.activeSeat ? null : next;
}

export function takeMulligan(input: GameState, seat: SeatId): Outcome {
  let state = input;
  const s = getSeat(state, seat);
  // CR 103.5 (London mulligan): shuffle the hand into the library and draw a fresh seven.
  for (const id of s.hand) {
    const obj = getObject(state, id);
    state = removeFromZone(state, obj);
    state = { ...state, objects: { ...state.objects, [id]: { ...obj, zone: 'library' } } };
    state = addToZone(state, 'library', seat, id, 'bottom');
  }
  const [shuffled, rng] = shuffle(zoneList(state, 'library', seat), state.rng);
  state = patchSeat({ ...state, rng }, seat, { library: shuffled, mulligans: s.mulligans + 1 });
  state = drawOpeningHand(state, seat);
  return {
    state: askMulligan({ ...state, pending: null }, seat),
    events: [{ kind: 'mulliganTaken', seat, count: s.mulligans + 1 }],
  };
}

export function keepHand(state: GameState, seat: SeatId): Outcome {
  const events: GameEvent[] = [{ kind: 'handKept', seat }];
  const bottom = bottomCountFor(state, seat);
  const cleared: GameState = { ...state, pending: null };
  if (bottom > 0) {
    const s = getSeat(cleared, seat);
    return {
      state: setPending(cleared, { kind: 'mulliganBottom', seat, count: bottom, hand: s.hand }),
      events,
    };
  }
  // Keep the events of what follows (the first turn beginning when everyone has kept).
  const after = afterKeep(cleared, seat);
  return { state: after.state, events: [...events, ...after.events] };
}

export function bottomCards(state: GameState, seat: SeatId, objects: readonly ObjectId[]): Outcome {
  let next: GameState = { ...state, pending: null };
  for (const id of objects) {
    const obj = getObject(next, id);
    next = removeFromZone(next, obj);
    next = { ...next, objects: { ...next.objects, [id]: { ...obj, zone: 'library' } } };
    next = addToZone(next, 'library', seat, id, 'bottom');
  }
  return afterKeep(next, seat);
}

function afterKeep(state: GameState, seat: SeatId): Outcome {
  const next = nextMulliganSeat(state, seat);
  if (next !== null) return { state: askMulligan(state, next), events: [] };
  // Everyone kept: the starting player takes the first turn (CR 103.8).
  return startTurn({ ...state, turn: { ...state.turn, number: 0 } }, state.turn.activeSeat);
}

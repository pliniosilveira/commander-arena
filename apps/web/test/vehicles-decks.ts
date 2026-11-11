/**
 * The hidden SYNTHETIC deck `synthetic-vehicles` (game/precons.ts: invented engine fixtures, not
 * real cards) through the game host or the page's store, and a search for a seed whose game
 * reaches a crew situation. A scripted human plays lands, creatures, Vehicles and Sol Rings (every
 * other card stays in the hand) and only ever passes priority, so a crew happens only when a
 * scenario crews on purpose.
 */
import type {
  Action,
  GameView,
  ObjectView,
  PendingDecision,
  PriorityDecision,
} from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';
import {
  handOf,
  hostSession,
  permanent,
  priorityOf,
  type Session,
  storeSession,
} from './ward-decks';

export const VEHICLE_DECK = 'synthetic-vehicles';
export const WAGON = 'SYNTHETIC Rattle Wagon';
/** Crew 3 on the Wagon: two Grizzly Bears (power 2 each) are the smallest group that pays. */
export const WAGON_CREW = 3;

export type VehicleStore = ReturnType<typeof createAppStore>;

const isVehicle = (o: ObjectView): boolean => o.subtypes.includes('Vehicle');

/** The scripted human: lands first, then creatures, Vehicles and Sol Rings; nothing else is cast. */
export function vehicleBot(view: GameView, decision: PendingDecision): Action {
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  const land = decision.options.find((o) => o.kind === 'playLand');
  if (land !== undefined) return land;
  const hand = handOf(view);
  const cast = decision.options.find(
    (o) =>
      o.kind === 'castSpell' &&
      hand.some(
        (c) =>
          c.id === o.object &&
          (c.types.includes('creature') || isVehicle(c) || c.name === 'Sol Ring'),
      ),
  );
  return cast ?? { kind: 'pass' };
}

/** The viewer's untapped creatures other than `except`: what could pay a crew cost. */
export function crewers(view: GameView, except: ObjectView): ObjectView[] {
  return view.battlefield.filter(
    (o) =>
      o.controller === view.viewer &&
      o.id !== except.id &&
      !o.tapped &&
      o.types.includes('creature'),
  );
}

/** The priority option that activates the crew ability of `vehicle`, if the engine offers it. */
export function crewOption(priority: PriorityDecision, vehicle: ObjectView): Action | null {
  return priority.options.find((o) => o.kind === 'activate' && o.object === vehicle.id) ?? null;
}

/**
 * The viewer has priority in their own precombat main phase with an empty stack, a Rattle Wagon
 * that can attack this turn (it did not arrive this turn) and at least `spare` other untapped
 * creatures whose power adds up to the Wagon's Crew 3, so a crew asks which to tap.
 */
export function canCrewWagon(view: GameView, spare = 2): boolean {
  const priority = priorityOf(view);
  const wagon = permanent(view, WAGON, true);
  if (priority === null || wagon === undefined) return false;
  if (view.activeSeat !== view.viewer || view.step !== 'precombatMain') return false;
  if (view.stack.length > 0 || wagon.tapped || wagon.wouldBeSummoningSick === true) return false;
  const power = crewers(view, wagon).reduce((n, o) => n + (o.power ?? 0), 0);
  return (
    crewers(view, wagon).length >= spare &&
    power >= WAGON_CREW &&
    crewOption(priority, wagon) !== null
  );
}

/** A game of the vehicle deck against the same deck, played by the scripted human until `accept`. */
export async function searchVehicles(
  start: (seed: number) => Promise<Session>,
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ session: Session; seed: number } | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const session = await start(seed);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view)) return { session, seed };
      if ((await session.act(vehicleBot(view, view.pending))) === null) break;
    }
  }
  return null;
}

export const startHost = async (seed: number): Promise<Session & { host: GameHost }> => {
  const host = new GameHost({ clock: () => 0 });
  const first = (await host.newGame({ seed, humanDeck: VEHICLE_DECK, aiDeck: VEHICLE_DECK }))
    .snapshot;
  return { ...hostSession(host, first), host };
};

export const startStore = async (seed: number): Promise<Session & { store: VehicleStore }> => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed, humanDeck: VEHICLE_DECK, aiDeck: VEHICLE_DECK });
  return { ...storeSession(store), store };
};

async function must(session: Session, action: Action): Promise<Snapshot> {
  const next = await session.act(action);
  if (next === null) throw new Error(`the engine refused ${action.kind}`);
  return next;
}

/** Activates the Wagon's crew ability; the engine then asks which creatures to tap. */
export async function startCrew(session: Session): Promise<Snapshot> {
  const view = session.snapshot().view;
  const wagon = permanent(view, WAGON, true);
  const priority = priorityOf(view);
  if (wagon === undefined || priority === null) throw new Error('no Wagon to crew');
  const option = crewOption(priority, wagon);
  if (option === null) throw new Error('the Wagon cannot be crewed');
  const snap = await must(session, option);
  if (snap.view.pending?.kind !== 'choosePermanent') {
    throw new Error(`expected a crew choice, got ${snap.view.pending?.kind}`);
  }
  return snap;
}

/** Answers the crew choice with the first two legal creatures (two Bears pay Crew 3). */
export async function crewWithTwo(session: Session): Promise<Snapshot> {
  const pending = session.snapshot().view.pending;
  if (pending?.kind !== 'choosePermanent') throw new Error('no crew choice');
  return must(session, { kind: 'choosePermanents', objects: pending.legal.slice(0, 2) });
}

/** Passes priority until the human is asked something other than priority (or `max` passes). */
export async function passUntil(
  session: Session,
  stop: (view: GameView) => boolean,
  max = 12,
): Promise<Snapshot> {
  let snap = session.snapshot();
  for (
    let i = 0;
    i < max && !stop(snap.view) && snap.view.pending?.seat === snap.view.viewer;
    i += 1
  ) {
    const pending = snap.view.pending;
    if (pending === null) break;
    snap = await must(
      session,
      pending.kind === 'priority' ? { kind: 'pass' } : chooseAction(snap.view, pending),
    );
  }
  return snap;
}

/** True when the pending decision is a crew choice. */
export const crewAsk = (view: GameView): boolean =>
  view.pending?.kind === 'choosePermanent' && view.pending.purpose === 'crew';

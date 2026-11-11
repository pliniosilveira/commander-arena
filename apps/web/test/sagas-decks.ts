/**
 * The hidden SYNTHETIC deck `synthetic-sagas` (game/precons.ts: invented engine fixtures, not real
 * cards) through the game host or the page's store, and a search for a seed whose game reaches a
 * Saga situation. A scripted human plays lands, Sol Rings and Sagas (other cards stay in the hand)
 * and otherwise passes priority, so a Saga's chapters come only from its own lore counters.
 */
import type { Action, GameView, ObjectView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';
import { handOf, hostSession, type Session, storeSession } from './ward-decks';

export const SAGA_DECK = 'synthetic-sagas';
export const RITE = 'SYNTHETIC Rite of Three';

export type SagaStore = ReturnType<typeof createAppStore>;

const isSaga = (o: ObjectView): boolean => o.subtypes.includes('Saga');

/** The scripted human: lands first, then Sol Rings and Sagas; nothing else is cast. */
export function sagaBot(view: GameView, decision: PendingDecision): Action {
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  const land = decision.options.find((o) => o.kind === 'playLand');
  if (land !== undefined) return land;
  const hand = handOf(view);
  const cast = decision.options.find(
    (o) =>
      o.kind === 'castSpell' &&
      hand.some((c) => c.id === o.object && (isSaga(c) || c.name === 'Sol Ring')),
  );
  return cast ?? { kind: 'pass' };
}

/** The viewer's Saga on the battlefield with this name, if any. */
export function sagaOf(view: GameView, name = RITE): ObjectView | undefined {
  return view.battlefield.find((o) => o.name === name && o.controller === view.viewer);
}

/** A game of the Saga deck against itself, played by the scripted human until `accept`. */
export async function searchSagas(
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
      if ((await session.act(sagaBot(view, view.pending))) === null) break;
    }
  }
  return null;
}

export const startHost = async (seed: number): Promise<Session & { host: GameHost }> => {
  const host = new GameHost({ clock: () => 0 });
  const first = (await host.newGame({ seed, humanDeck: SAGA_DECK, aiDeck: SAGA_DECK })).snapshot;
  return { ...hostSession(host, first), host };
};

export const startStore = async (seed: number): Promise<Session & { store: SagaStore }> => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  // Without Full Control the autopilot resolves the player's own abilities without a stop (D-045).
  store.getState().setSettings({ fullControl: true });
  await store.getState().startGame({ seed, humanDeck: SAGA_DECK, aiDeck: SAGA_DECK });
  return { ...storeSession(store), store };
};

/** The human has priority with one of their Rite of Three chapter abilities on the stack. */
export function riteChapterOnStack(view: GameView): boolean {
  return view.stack.some(
    (o) => o.abilitySource !== undefined && o.name === RITE && o.controller === view.viewer,
  );
}

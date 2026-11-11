/**
 * A human deck of SYNTHETIC trigger, sacrifice and token cards (engine fixtures, not real cards),
 * and a search for a seed whose game asks the human a given question. The default test decks hold
 * no triggered abilities, so the decisions of M5 S2 are reached with this deck through the host.
 */
import { type DeckConfig, deckOf, type PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

type Kind = PendingDecision['kind'];

export const TRIGGER_DECK: DeckConfig = {
  cards: deckOf([
    ['Yargle, Glutton of Urborg', 1],
    ['Swamp', 17],
    ['Island', 15],
    ['Sol Ring', 1],
    ['SYNTHETIC Sacrifice Dragon', 8],
    ['SYNTHETIC Sacrifice Reader', 8],
    ['SYNTHETIC May Draw Creature', 8],
    ['SYNTHETIC Enters Draw Creature', 6],
    ['SYNTHETIC Dies Treasure Creature', 6],
    ['SYNTHETIC Mourner', 5],
    ['SYNTHETIC Edict', 5],
    ['SYNTHETIC Landfall Tokenmaker', 3],
    ['SYNTHETIC Treasure Land', 3],
    ['SYNTHETIC Make Treasures', 4],
    ['SYNTHETIC Spell Watcher', 3],
    ['SYNTHETIC Creature Sacrifice Watcher', 3],
  ]),
  commanders: [0],
};

export type TriggerStore = ReturnType<typeof createAppStore>;

export function triggerStore(): TriggerStore {
  return createAppStore({ client: new GameHost({ clock: () => 0 }) });
}

export async function startTriggerGame(store: TriggerStore, seed: number): Promise<void> {
  await store.getState().startGame({
    seed,
    humanDeck: 'trigger-test',
    aiDeck: 'swamp-forest',
    humanCards: TRIGGER_DECK,
  });
}

/**
 * Plays the scripted human (`chooseAction`) with the trigger deck until the game asks `kind`.
 * Tries seeds in order and returns the first store that got there, with its seed.
 */
export async function reachTriggerDecision(
  kind: Kind,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ store: TriggerStore; seed: number } | null> {
  const { seeds = 60, maxClicks = 700 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = triggerStore();
    await startTriggerGame(store, seed);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (view.pending.kind === kind) return { store, seed };
      const before = store.getState().snapshot?.revision;
      await store.getState().act(chooseAction(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}

/** The host without the store: no autopilot, so every action is one the test sent. */
export async function reachOnHost(
  kind: Kind,
  opts: { seeds?: number; maxClicks?: number; accept?: (snap: Snapshot) => boolean } = {},
): Promise<{ host: GameHost; snap: Snapshot; seed: number } | null> {
  const { seeds = 80, maxClicks = 900, accept = () => true } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (
      await host.newGame({
        seed,
        humanDeck: 'trigger-test',
        aiDeck: 'swamp-forest',
        humanCards: TRIGGER_DECK,
      })
    ).snapshot;
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = snap.view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.kind === kind && accept(snap)) return { host, snap, seed };
      const next = await host.act(chooseAction(view, view.pending));
      if (next.error !== null) break;
      snap = next;
    }
  }
  return null;
}

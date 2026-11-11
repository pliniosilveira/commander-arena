/**
 * The hidden SYNTHETIC deck `synthetic-search` (game/precons.ts: invented engine fixtures, not real
 * cards) through the game host, and a search for a seed whose game asks the human to choose cards.
 * A scripted human (`chooseAction`) plays lands and casts spells until `accept` says stop.
 */
import type { ChooseCardsDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { type AppStore, createAppStore } from '../src/store';
import { chooseAction } from './bot';

export type Reached = { host: GameHost; snap: Snapshot; seed: number };

/** The first seed whose game reaches a human chooseCards decision `accept` likes. */
export async function reachSearch(
  accept: (decision: ChooseCardsDecision, snap: Snapshot) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<Reached | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: 'synthetic-search', aiDeck: 'swamp-forest' }))
      .snapshot;
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = snap.view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.kind === 'chooseCards' && accept(view.pending, snap)) {
        return { host, snap, seed };
      }
      const next = await host.act(chooseAction(view, view.pending));
      if (next.error !== null) break;
      snap = next;
    }
  }
  return null;
}

export const anySearch = (d: ChooseCardsDecision) => d.purpose === 'search';
export const anyDiscard = (d: ChooseCardsDecision) => d.purpose === 'discard';

/** The same search, through the store (autopilot and all), for the render tests. */
export async function reachSearchStore(
  accept: (decision: ChooseCardsDecision) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ store: AppStore; seed: number } | null> {
  const { seeds = 30, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store
      .getState()
      .startGame({ seed, humanDeck: 'synthetic-search', aiDeck: 'swamp-forest' });
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (view.pending.kind === 'chooseCards' && accept(view.pending)) return { store, seed };
      const before = store.getState().snapshot?.revision;
      await store.getState().act(chooseAction(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}

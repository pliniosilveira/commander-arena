/**
 * The hidden SYNTHETIC deck `synthetic-pt` (game/precons.ts: invented engine fixtures, not real cards)
 * through the game host and the store, and a search for a seed whose game reaches a situation with a
 * creature whose power and toughness a count defines, or an Equipment that counts artifacts. A
 * scripted human (`chooseAction`) plays lands and casts spells until `accept` says stop.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const PT_DECK = 'synthetic-pt';

export type Reached = { host: GameHost; snap: Snapshot; seed: number };

export async function reachPt(
  accept: (snap: Snapshot) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<Reached | null> {
  const { seeds = 80, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: PT_DECK, aiDeck: 'swamp-forest' })).snapshot;
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = snap.view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(snap)) return { host, snap, seed };
      const next = await host.act(chooseAction(view, view.pending));
      if (next.error !== null) break;
      snap = next;
    }
  }
  return null;
}

export async function mustReachPt(
  accept: (snap: Snapshot) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<Reached> {
  const reached = await reachPt(accept, opts);
  if (reached === null) throw new Error('no seed reached the situation');
  return reached;
}

export type PtStore = ReturnType<typeof createAppStore>;

/** The same search through the page's store, for the render tests: returns the store at `accept`. */
export async function reachPtStore(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<PtStore | null> {
  const { seeds = 80, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: PT_DECK, aiDeck: 'swamp-forest' });
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (view.pending.kind === 'priority' && accept(view)) return store;
      const before = store.getState().snapshot?.revision;
      await store.getState().act(chooseAction(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}

/** My cards in hand with this name. */
export const inHand = (view: GameView, name: string): ObjectView | undefined =>
  (view.seats[view.viewer]?.hand ?? []).find((o) => o.name === name);

/** My permanents with this name on the battlefield. */
export const onField = (view: GameView, name: string): ObjectView[] =>
  view.battlefield.filter((o) => o.name === name && o.controller === view.viewer);

export const myLands = (view: GameView): number =>
  view.battlefield.filter((o) => o.types.includes('land') && o.controller === view.viewer).length;

export const myArtifacts = (view: GameView): number =>
  view.battlefield.filter((o) => o.types.includes('artifact') && o.controller === view.viewer)
    .length;

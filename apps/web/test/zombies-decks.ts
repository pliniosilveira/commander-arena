/**
 * The hidden SYNTHETIC deck `synthetic-zombies` (game/precons.ts: invented engine fixtures, not real cards) through the
 * page's store, and a search for a seed whose game reaches a situation: the Gift question, or the "sacrifice any number"
 * choice. A scripted human (`chooseAction`) plays lands and casts spells until `accept` says stop.
 */
import type { GameView } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const ZOMBIES_DECK = 'synthetic-zombies';

export type ZombiesStore = ReturnType<typeof createAppStore>;

export async function reachZombiesStore(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<ZombiesStore | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: ZOMBIES_DECK, aiDeck: 'swamp-forest' });
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (accept(view)) return store;
      const before = store.getState().snapshot?.revision;
      await store.getState().act(chooseAction(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}

/** The viewer is asked whether to promise a gift as they cast the spell with this name. */
export const asksGift = (name: string) => (view: GameView) =>
  view.pending?.kind === 'confirmOptional' &&
  view.pending.purpose === 'gift' &&
  view.pending.sourceName === name;

/** The viewer chooses any number of permanents to sacrifice (a sacrifice with no minimum). */
export const asksAnyNumber = (view: GameView) =>
  view.pending?.kind === 'choosePermanent' &&
  view.pending.purpose === 'sacrifice' &&
  view.pending.min === 0;

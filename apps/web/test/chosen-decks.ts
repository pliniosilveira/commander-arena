/**
 * The hidden SYNTHETIC deck `synthetic-chosen` (game/precons.ts: invented engine fixtures, not real
 * cards) through the game host and the store, and a search for a seed whose game reaches the
 * question "As X enters, choose a creature type / a color". A scripted human (`chooseAction`) plays
 * lands and casts spells until `accept` says stop.
 */
import type { ChooseOptionDecision, GameView } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const CHOSEN_DECK = 'synthetic-chosen';

export function chooseOptionOf(view: GameView): ChooseOptionDecision | null {
  const p = view.pending;
  return p?.kind === 'chooseOption' ? p : null;
}

/** The viewer is asked to choose for the card with this name (any card when none is named). */
export const asksChoice =
  (purpose: ChooseOptionDecision['purpose'], name?: string) =>
  (view: GameView): boolean => {
    const p = chooseOptionOf(view);
    return (
      p !== null &&
      p.seat === view.viewer &&
      p.purpose === purpose &&
      (name === undefined || p.sourceName === name)
    );
  };

export async function reachChosen(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ host: GameHost; snap: Snapshot; seed: number } | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: CHOSEN_DECK, aiDeck: 'swamp-forest' }))
      .snapshot;
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = snap.view;
      if (view.result !== null || view.pending === null) break;
      if (accept(view)) return { host, snap, seed };
      const next = await host.act(chooseAction(view, view.pending));
      if (next.error !== null) break;
      snap = next;
    }
  }
  return null;
}

export type ChosenStore = ReturnType<typeof createAppStore>;

/** The same search through the page's store (with its autopilot), for the render tests. */
export async function reachChosenStore(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<ChosenStore | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: CHOSEN_DECK, aiDeck: 'swamp-forest' });
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

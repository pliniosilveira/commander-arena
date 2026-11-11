/**
 * The hidden SYNTHETIC deck `synthetic-keyword-batch` (game/precons.ts: invented engine fixtures,
 * not real cards) through the game host and the store, and a search for a seed whose game reaches
 * a situation: the multikicker question, a split-second spell on the stack with the human holding
 * priority, or poison counters on the opponent. A scripted human (`chooseAction`) plays lands and
 * casts spells; every other multikicker question is answered "0 times".
 */
import type { GameView } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const KEYWORD_DECK = 'synthetic-keyword-batch';

export async function reachKeywords(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ host: GameHost; snap: Snapshot; seed: number } | null> {
  const { seeds = 120, maxClicks = 600 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: KEYWORD_DECK, aiDeck: 'swamp-forest' }))
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

export type KeywordStore = ReturnType<typeof createAppStore>;

/** The same search through the page's store (with its autopilot), for the render tests. */
export async function reachKeywordsStore(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<KeywordStore | null> {
  const { seeds = 120, maxClicks = 600 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: KEYWORD_DECK, aiDeck: 'swamp-forest' });
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

/** The viewer is asked how many times to pay the multikicker cost of the named card. */
export const asksMultikicker =
  (name: string, atLeast = 1) =>
  (view: GameView): boolean => {
    const p = view.pending;
    return (
      p?.kind === 'chooseX' &&
      p.seat === view.viewer &&
      p.purpose === 'multikicker' &&
      p.sourceName === name &&
      p.max >= atLeast
    );
  };

/** The viewer holds priority with a spell with split second on the stack. */
export const holdsPriorityUnderSplitSecond = (view: GameView): boolean =>
  view.pending?.kind === 'priority' &&
  view.pending.seat === view.viewer &&
  view.stack.some((o) => o.abilitySource === undefined && o.keywords.includes('splitSecond'));

/** The opponent has poison counters. */
export const opponentPoisoned = (view: GameView): boolean =>
  view.seats.some((s) => s.id !== view.viewer && s.poison > 0);

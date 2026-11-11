/**
 * The hidden SYNTHETIC deck `synthetic-artifacts` (game/precons.ts: invented engine fixtures, not real cards) through the
 * page's store, and a search for a seed whose game reaches a situation: the "look at the top cards" pick, the "discard
 * two cards unless you discard an artifact card" choice, or the "tap any number of creatures" choice. A scripted human
 * (`chooseAction`) plays lands and casts spells until `accept` says stop.
 */
import type { GameView } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const ARTIFACTS_DECK = 'synthetic-artifacts';

export type ArtifactsStore = ReturnType<typeof createAppStore>;

export async function reachArtifactsStore(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<ArtifactsStore | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: ARTIFACTS_DECK, aiDeck: 'swamp-forest' });
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

/** The viewer looks at the top cards of their library and may take some (`lookTake`), with a card that cannot be taken. */
export const asksLookTake = (view: GameView) =>
  view.pending?.kind === 'chooseCards' &&
  view.pending.purpose === 'lookTake' &&
  (view.pending.looked?.length ?? 0) > view.pending.legal.length;

/** The viewer discards two cards unless they discard an artifact card, and holds both kinds of answer. */
export const asksDiscardUnless = (view: GameView) =>
  view.pending?.kind === 'chooseCards' &&
  view.pending.orSingle !== undefined &&
  view.pending.orSingle.length < view.pending.legal.length;

/** The viewer may tap any number of untapped creatures they control (an attack trigger's choice). */
export const asksTapAny = (view: GameView) =>
  view.pending?.kind === 'choosePermanent' &&
  view.pending.purpose === 'effect' &&
  view.pending.min === 0;

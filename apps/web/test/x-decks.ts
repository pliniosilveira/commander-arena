/**
 * The hidden SYNTHETIC deck `synthetic-x` (game/precons.ts: invented engine fixtures, not real
 * cards) through the game host and the store, and a search for a seed whose game reaches the
 * question "Choose X". A scripted human plays lands and casts spells (and activates the Double
 * Well, which the plain bot never does) until `accept` says stop; every earlier X question is
 * answered with the smallest X.
 */
import type { Action, ChooseXDecision, GameView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const X_DECK = 'synthetic-x';

export function chooseXOf(view: GameView): ChooseXDecision | null {
  const p = view.pending;
  return p?.kind === 'chooseX' ? p : null;
}

/** The viewer is asked for X by the card with this name (any card when none is named). */
export const asksX =
  (name?: string, atLeast = 0, purpose?: ChooseXDecision['purpose']) =>
  (view: GameView): boolean => {
    const p = chooseXOf(view);
    return (
      p !== null &&
      p.seat === view.viewer &&
      p.max >= atLeast &&
      (name === undefined || p.sourceName === name) &&
      (purpose === undefined || p.purpose === purpose)
    );
  };

/** The scripted human: the plain bot, but a Double Well is activated whenever it can be. */
export function xAction(view: GameView, decision: PendingDecision): Action {
  if (decision.kind === 'priority') {
    const well = view.battlefield.find((o) => o.name === 'SYNTHETIC Double Well');
    const use = decision.options.find((o) => o.kind === 'activate' && o.object === well?.id);
    if (use?.kind === 'activate') return use;
  }
  return chooseAction(view, decision);
}

export async function reachX(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ host: GameHost; snap: Snapshot; seed: number } | null> {
  const { seeds = 120, maxClicks = 600 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: X_DECK, aiDeck: 'swamp-forest' })).snapshot;
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = snap.view;
      if (view.result !== null || view.pending === null) break;
      if (accept(view)) return { host, snap, seed };
      const next = await host.act(xAction(view, view.pending));
      if (next.error !== null) break;
      snap = next;
    }
  }
  return null;
}

export type XStore = ReturnType<typeof createAppStore>;

/** The same search through the page's store (with its autopilot), for the render tests. */
export async function reachXStore(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<XStore | null> {
  const { seeds = 120, maxClicks = 600 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: X_DECK, aiDeck: 'swamp-forest' });
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (accept(view)) return store;
      const before = store.getState().snapshot?.revision;
      await store.getState().act(xAction(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}

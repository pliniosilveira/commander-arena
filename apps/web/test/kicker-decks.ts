/**
 * The hidden SYNTHETIC deck `synthetic-kicker` (game/precons.ts: invented engine fixtures, not
 * real cards) through the game host, and a search for a seed whose game reaches a situation: the
 * kicker question for a named card, or a graveyard card that can be cast with flashback. A scripted
 * human (`chooseAction`) plays lands and casts spells until `accept` says stop.
 */
import type { GameView, ObjectView, PriorityDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { objectIndex } from '../src/ui/decisions/lookup';
import { chooseAction } from './bot';

export const KICKER_DECK = 'synthetic-kicker';

export async function reachKicker(
  accept: (snap: Snapshot) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ host: GameHost; snap: Snapshot; seed: number } | null> {
  const { seeds = 80, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: KICKER_DECK, aiDeck: 'swamp-forest' }))
      .snapshot;
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

/** The viewer is asked the kicker question for the card with this name. */
export const asksKicker = (name: string) => (snap: Snapshot) => {
  const p = snap.view.pending;
  return p?.kind === 'confirmOptional' && p.purpose === 'kicker' && p.sourceName === name;
};

/** The graveyard cards of the viewer that the priority decision offers to cast with flashback. */
export function flashbackCards(view: GameView): ObjectView[] {
  const p = view.pending;
  if (p?.kind !== 'priority') return [];
  const index = objectIndex(view);
  return p.options.flatMap((o) => {
    const card =
      o.kind === 'castSpell' && o.alternative === 'flashback' ? index.get(o.object) : null;
    return card === null || card === undefined ? [] : [card];
  });
}

/** The viewer has priority and may cast a graveyard card with flashback (named, when given). */
export const canFlashback = (name?: string) => (snap: Snapshot) =>
  flashbackCards(snap.view).some((c) => name === undefined || c.name === name);

export function priorityOf(snap: Snapshot): PriorityDecision | null {
  const p = snap.view.pending;
  return p?.kind === 'priority' ? p : null;
}

/** Passes (as the page's Resolve button does) until the stack is empty again; returns the last. */
export async function resolveStack(host: GameHost, from: Snapshot): Promise<Snapshot> {
  let snap = from;
  for (let i = 0; i < 40 && snap.view.stack.length > 0; i += 1) {
    const pending = snap.view.pending;
    if (pending === null) break;
    const next = await host.act(
      pending.kind === 'priority' ? { kind: 'pass' } : chooseAction(snap.view, pending),
    );
    if (next.error !== null) throw new Error(next.error);
    snap = next;
  }
  return snap;
}

export type KickerStore = ReturnType<typeof createAppStore>;

/**
 * The same search through the page's store (with its autopilot), for the render tests: plays the
 * scripted human until the pending decision satisfies `accept`, then returns the store.
 */
export async function reachKickerStore(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number; makeHost?: () => GameHost } = {},
): Promise<KickerStore | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({
      client: opts.makeHost?.() ?? new GameHost({ clock: () => 0 }),
    });
    await store.getState().startGame({ seed, humanDeck: KICKER_DECK, aiDeck: 'swamp-forest' });
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

/**
 * The hidden SYNTHETIC deck `synthetic-abilities` (game/precons.ts: invented engine fixtures, not
 * real cards) through the game host, and a search for a seed whose game reaches a situation where
 * an activated ability can be used. A scripted human (`chooseAction`) plays lands and casts spells
 * until `accept` says stop.
 */
import type { Action, GameView, ObjectView, PriorityDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi } from '../src/ui/decisions/ui-state';
import { chooseAction } from './bot';

export const ABILITIES_DECK = 'synthetic-abilities';

export async function reachAbilities(
  accept: (snap: Snapshot) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ host: GameHost; snap: Snapshot; seed: number } | null> {
  const { seeds = 60, maxClicks = 400 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: ABILITIES_DECK, aiDeck: 'swamp-forest' }))
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

/** Every object the viewer can see that has this name: battlefield, own hand. */
export function find(view: GameView, name: string): ObjectView | undefined {
  return [...view.battlefield, ...(view.seats[view.viewer]?.hand ?? [])].find(
    (o) => o.name === name,
  );
}

/** The priority decision of the viewer, or null. */
export function priorityOf(snap: Snapshot): PriorityDecision | null {
  const p = snap.view.pending;
  return p?.kind === 'priority' ? p : null;
}

/** True when the viewer has priority with an `activate` option on a card with this name. */
export function canActivate(snap: Snapshot, name: string): boolean {
  const p = priorityOf(snap);
  if (p === null) return false;
  return p.options.some((o) => o.kind === 'activate' && find(snap.view, name)?.id === o.object);
}

/** The `activate` action for the first ability of the named card, or null. */
export function activateAction(snap: Snapshot, name: string): Action | null {
  const p = priorityOf(snap);
  const id = find(snap.view, name)?.id;
  const option = p?.options.find((o) => o.kind === 'activate' && o.object === id);
  return option?.kind === 'activate' ? option : null;
}

/** The action the bar's Cancel (the Esc button) sends for the pending decision, as a click would. */
export function pressCancel(view: GameView): Action {
  const pending = view.pending;
  if (pending === null) throw new Error('nothing pending');
  const sent: Action[] = [];
  const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
  buildModel(view, pending, initialUi(pending), ctl).bar.cancel?.run();
  const action = sent[0];
  if (action === undefined) throw new Error('the model has no Cancel');
  return action;
}

export type AbilitiesStore = ReturnType<typeof createAppStore>;

/**
 * The same search through the page's store (with its autopilot), for the render tests: plays the
 * scripted human until `accept` holds, then sends `then(view)` and returns the store.
 */
export async function reachAbilitiesStore(
  accept: (view: GameView) => boolean,
  then: (view: GameView) => Action,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<AbilitiesStore | null> {
  const { seeds = 40, maxClicks = 400 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: ABILITIES_DECK, aiDeck: 'swamp-forest' });
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      const before = store.getState().snapshot?.revision;
      if (view.pending.kind === 'priority' && accept(view)) {
        await store.getState().act(then(view));
        return store;
      }
      await store.getState().act(chooseAction(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}

/**
 * The hidden SYNTHETIC deck `synthetic-modal` (game/precons.ts: invented engine fixtures, not real
 * cards) through the game host and the store, and a search for a seed whose game reaches a
 * situation: the question "Choose one —" for a named card. A scripted human (`chooseAction`) plays
 * lands and casts spells, answering every modal question with the first legal set, until `accept`
 * says stop.
 */
import type { ChooseModesDecision, GameView } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const MODAL_DECK = 'synthetic-modal';

export function modesOf(view: GameView): ChooseModesDecision | null {
  const p = view.pending;
  return p?.kind === 'chooseModes' ? p : null;
}

/** The viewer is asked for modes by the card with this name (any card when none is named). */
export const asksModes =
  (name?: string, purpose?: ChooseModesDecision['purpose']) =>
  (view: GameView): boolean => {
    const p = modesOf(view);
    return (
      p !== null &&
      p.seat === view.viewer &&
      (name === undefined || p.sourceName === name) &&
      (purpose === undefined || p.purpose === purpose)
    );
  };

export async function reachModal(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ host: GameHost; snap: Snapshot; seed: number } | null> {
  const { seeds = 120, maxClicks = 600 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: MODAL_DECK, aiDeck: 'swamp-forest' }))
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

export type ModalStore = ReturnType<typeof createAppStore>;

/** The same search through the page's store (with its autopilot), for the render tests. */
export async function reachModalStore(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<ModalStore | null> {
  const { seeds = 120, maxClicks = 600 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: MODAL_DECK, aiDeck: 'swamp-forest' });
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

/** The viewer has priority and may cast the card with this name from the hand. */
export const canCastNamed =
  (name: string, when: (view: GameView) => boolean = () => true) =>
  (view: GameView): boolean => {
    const p = view.pending;
    if (p?.kind !== 'priority' || p.seat !== view.viewer || !when(view)) return false;
    const hand = view.seats[view.viewer]?.hand ?? [];
    return p.options.some(
      (o) => o.kind === 'castSpell' && hand.some((c) => c.id === o.object && c.name === name),
    );
  };

/** No creature is on the battlefield, so no "target creature" mode of any spell is legal. */
export const noCreatures = (view: GameView): boolean =>
  !view.battlefield.some((o) => o.types.includes('creature'));

/** At least one creature is on the battlefield (a legal target for "target creature"). */
export const someCreature = (view: GameView): boolean => !noCreatures(view);

/** The action that casts the card with this name (a priority decision offering it). */
export function castNamed(view: GameView, name: string) {
  const p = view.pending;
  if (p?.kind !== 'priority') throw new Error('not a priority decision');
  const hand = view.seats[view.viewer]?.hand ?? [];
  const option = p.options.find(
    (o) => o.kind === 'castSpell' && hand.some((c) => c.id === o.object && c.name === name),
  );
  if (option === undefined) throw new Error(`cannot cast ${name}`);
  return option;
}

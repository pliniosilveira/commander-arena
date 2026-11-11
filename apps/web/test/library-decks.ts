/**
 * The hidden SYNTHETIC deck `synthetic-library` (game/precons.ts: invented engine fixtures, not
 * real cards) through the game host or the page's store, and a search for a seed whose game asks
 * the human to arrange the top of the library (scry, surveil, reorder) or to put cards from the
 * hand on top (CR 701.22, 701.25, D-091). A scripted human plays lands and Sol Rings and casts
 * only the cards named in `cast`; every other card stays in the hand.
 */
import type {
  Action,
  ArrangeCardsDecision,
  ChooseCardsDecision,
  GameView,
  PendingDecision,
} from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';
import { handOf, hostSession, type Session, storeSession } from './ward-decks';

export const LIBRARY_DECK = 'synthetic-library';
export const SEER = 'SYNTHETIC Seer Of The Door';
export const WATCHER = 'SYNTHETIC Grave Watcher';
export const BRAINSTORM = 'SYNTHETIC Brainstorm Like';
export const REORDER = 'SYNTHETIC Reorder Three';

export type LibraryStore = ReturnType<typeof createAppStore>;

/** The scripted human: lands and Sol Rings first, then the cards in `cast`; nothing else is cast. */
export function libraryBot(cast: readonly string[]) {
  return (view: GameView, decision: PendingDecision): Action => {
    if (decision.kind !== 'priority') return chooseAction(view, decision);
    const land = decision.options.find((o) => o.kind === 'playLand');
    if (land !== undefined) return land;
    const hand = handOf(view);
    const spell = decision.options.find(
      (o) =>
        o.kind === 'castSpell' &&
        hand.some((c) => c.id === o.object && (c.name === 'Sol Ring' || cast.includes(c.name))),
    );
    return spell ?? { kind: 'pass' };
  };
}

/** The human is asked to arrange cards of this purpose. */
export const arranging =
  (purpose: ArrangeCardsDecision['purpose']) =>
  (view: GameView): boolean =>
    view.pending?.kind === 'arrangeCards' &&
    view.pending.purpose === purpose &&
    view.pending.seat === view.viewer;

/** The human is asked to choose cards of their hand to put on top of their library. */
export const puttingOnTop = (view: GameView): boolean =>
  view.pending?.kind === 'chooseCards' &&
  view.pending.purpose === 'putOnTop' &&
  view.pending.seat === view.viewer;

export const arrangeOf = (view: GameView): ArrangeCardsDecision => {
  if (view.pending?.kind !== 'arrangeCards') throw new Error('not an arrangeCards decision');
  return view.pending;
};

export const putOnTopOf = (view: GameView): ChooseCardsDecision => {
  if (view.pending?.kind !== 'chooseCards') throw new Error('not a chooseCards decision');
  return view.pending;
};

/** A game of the deck against `aiDeck`, played by the scripted human until `accept`. */
export async function searchLibrary(
  start: (seed: number) => Promise<Session>,
  cast: readonly string[],
  accept: (view: GameView, session: Session) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ session: Session; seed: number } | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  const bot = libraryBot(cast);
  for (let seed = 1; seed <= seeds; seed += 1) {
    const session = await start(seed);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view, session)) return { session, seed };
      if ((await session.act(bot(view, view.pending))) === null) break;
    }
  }
  return null;
}

export const startHost =
  (humanDeck: string, aiDeck: string) =>
  async (seed: number): Promise<Session & { host: GameHost }> => {
    const host = new GameHost({ clock: () => 0 });
    const first = (await host.newGame({ seed, humanDeck, aiDeck })).snapshot;
    return { ...hostSession(host, first), host };
  };

export const startStore =
  (aiDeck: string) =>
  async (seed: number): Promise<Session & { store: LibraryStore }> => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    // Without Full Control the autopilot resolves the player's own abilities without a stop (D-045).
    store.getState().setSettings({ fullControl: true });
    await store.getState().startGame({ seed, humanDeck: LIBRARY_DECK, aiDeck });
    return { ...storeSession(store), store };
  };

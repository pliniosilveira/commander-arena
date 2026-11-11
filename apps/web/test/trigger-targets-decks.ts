/**
 * The hidden SYNTHETIC deck `synthetic-trigger-targets` (game/precons.ts: invented engine fixtures,
 * not real cards) through the game host or the page's store, and a search for a seed whose game
 * reaches a situation of a triggered ability that chooses targets (CR 603.3d). A scripted human
 * plays lands, Sol Rings and SYNTHETIC Reaper Imps (every other card stays in the hand) and
 * otherwise passes priority, so the only trigger it ever puts on the stack is the Imp's.
 */
import type { Action, GameView, ObjectView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';
import { handOf, hostSession, type Session, storeSession } from './ward-decks';

export const TRIGGER_TARGETS_DECK = 'synthetic-trigger-targets';
export const REAPER = 'SYNTHETIC Reaper Imp';

export type TargetsStore = ReturnType<typeof createAppStore>;

/** The scripted human: lands first, then Sol Rings and Reaper Imps; nothing else is cast. */
export function reaperBot(view: GameView, decision: PendingDecision): Action {
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  const land = decision.options.find((o) => o.kind === 'playLand');
  if (land !== undefined) return land;
  const hand = handOf(view);
  const cast = decision.options.find(
    (o) =>
      o.kind === 'castSpell' &&
      hand.some((c) => c.id === o.object && (c.name === REAPER || c.name === 'Sol Ring')),
  );
  return cast ?? { kind: 'pass' };
}

/** The human is asked for the targets of a triggered ability that is being put on the stack. */
export function triggerTargetsAsked(view: GameView): boolean {
  const p = view.pending;
  return p?.kind === 'targets' && p.forTrigger === true && p.seat === view.viewer;
}

/** The permanents of the opponent that are creatures. */
export const opposingCreatures = (view: GameView): readonly ObjectView[] =>
  view.battlefield.filter((o) => o.controller !== view.viewer && o.types.includes('creature'));

/** A game of the deck against `aiDeck`, played by the scripted human until `accept`. */
export async function searchTriggerTargets(
  start: (seed: number) => Promise<Session>,
  accept: (view: GameView, session: Session) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ session: Session; seed: number } | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const session = await start(seed);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view, session)) return { session, seed };
      if ((await session.act(reaperBot(view, view.pending))) === null) break;
    }
  }
  return null;
}

export const startHost =
  (aiDeck: string) =>
  async (seed: number): Promise<Session & { host: GameHost }> => {
    const host = new GameHost({ clock: () => 0 });
    const first = (await host.newGame({ seed, humanDeck: TRIGGER_TARGETS_DECK, aiDeck })).snapshot;
    return { ...hostSession(host, first), host };
  };

export const startStore =
  (aiDeck: string, fullControl = true) =>
  async (seed: number): Promise<Session & { store: TargetsStore }> => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    // Without Full Control the autopilot resolves the player's own abilities without a stop (D-045).
    store.getState().setSettings({ fullControl });
    await store.getState().startGame({ seed, humanDeck: TRIGGER_TARGETS_DECK, aiDeck });
    return { ...storeSession(store), store };
  };

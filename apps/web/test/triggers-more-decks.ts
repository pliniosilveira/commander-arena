/**
 * The hidden SYNTHETIC deck `synthetic-triggers-more` (game/precons.ts: invented engine fixtures,
 * not real cards) through the game host, against the same deck, and a search for a seed whose game
 * asks the human a given question. The scripted human plays lands and casts whatever it can, so the
 * opponent's tax cards ("unless that player pays") meet the human's spells.
 */
import type { GameView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';
import { hostSession, type Session, storeSession } from './ward-decks';

export const TRIGGERS_MORE_DECK = 'synthetic-triggers-more';

export const startMore = async (seed: number): Promise<Session & { host: GameHost }> => {
  const host = new GameHost({ clock: () => 0 });
  const first = (
    await host.newGame({ seed, humanDeck: TRIGGERS_MORE_DECK, aiDeck: TRIGGERS_MORE_DECK })
  ).snapshot;
  return { ...hostSession(host, first), host };
};

export type MoreStore = ReturnType<typeof createAppStore>;

/** The same game through the page's store, for the render tests. */
export const startMoreStore = async (seed: number): Promise<Session & { store: MoreStore }> => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  // Without Full Control the autopilot resolves the player's own abilities without a stop (D-045).
  store.getState().setSettings({ fullControl: true });
  await store
    .getState()
    .startGame({ seed, humanDeck: TRIGGERS_MORE_DECK, aiDeck: TRIGGERS_MORE_DECK });
  return { ...storeSession(store), store };
};

/** Plays on until the human faces a decision `accept` likes; null when no seed gets there. */
export async function searchMore<S extends Session = Session & { host: GameHost }>(
  accept: (view: GameView, decision: PendingDecision) => boolean,
  opts: { seeds?: number; maxClicks?: number; start?: (seed: number) => Promise<S> } = {},
): Promise<{ session: S; seed: number } | null> {
  const { seeds = 40, maxClicks = 400 } = opts;
  const start = opts.start ?? (startMore as unknown as (seed: number) => Promise<S>);
  for (let seed = 1; seed <= seeds; seed += 1) {
    const session = await start(seed);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = session.snapshot().view;
      const decision = view.pending;
      if (view.result !== null || decision === null) break;
      if (decision.seat === view.viewer && accept(view, decision)) return { session, seed };
      if (decision.seat !== view.viewer) break;
      if ((await session.act(chooseAction(view, decision))) === null) break;
    }
  }
  return null;
}

/** The human is asked "pay or the effect happens" (`unlessPays`, D-111). */
export const unlessAsk = (_view: GameView, d: PendingDecision): boolean =>
  d.kind === 'confirmOptional' && d.purpose === 'unlessPays';

/** The human controls the "unless that player pays" ability and is asked "you may" after the payer did not pay. */
export const mayEffectAsk = (view: GameView, d: PendingDecision): boolean => {
  if (d.kind !== 'confirmOptional' || d.purpose !== undefined) return false;
  const o = view.stack.find((s) => s.id === d.source);
  return o?.ability?.kind === 'triggered' && o.ability.effect.kind === 'unlessPays';
};

/** A trigger of the "beginning of combat on your turn" kind of the human is on the stack. */
export const beginCombatOnStack = (view: GameView): boolean =>
  view.stack.some(
    (o) =>
      o.controller === view.viewer &&
      o.ability?.kind === 'triggered' &&
      o.ability.trigger.kind === 'step' &&
      o.ability.trigger.step === 'beginCombat' &&
      o.ability.trigger.whose === 'you',
  );

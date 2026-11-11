/**
 * The hidden SYNTHETIC deck `synthetic-keywords-2` (game/precons.ts: invented engine fixtures, not real
 * cards) through the game host and the store, and a search for a seed whose game reaches a situation: a
 * Convoke, Improvise or Delve question, a regeneration shield, Extort's or Cascade's question. A scripted
 * human (`chooseAction`) plays lands and casts spells, answering every cost-payment question with the
 * engine's suggestion, until `accept` says stop. Seeds are searched, not fixed.
 */
import type {
  Action,
  ChoosePayOptionsDecision,
  GameView,
  PendingDecision,
} from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const KEYWORDS2_DECK = 'synthetic-keywords-2';

export function payOptionsOf(view: GameView): ChoosePayOptionsDecision | null {
  const p = view.pending;
  return p?.kind === 'choosePayOptions' ? p : null;
}

/** The viewer is asked what to tap or exile for this mechanism (any spell when none is named). */
export const asksPayOptions =
  (
    mechanism: ChoosePayOptionsDecision['mechanism'],
    opts: { nonEmpty?: boolean; spell?: string } = {},
  ) =>
  (view: GameView): boolean => {
    const p = payOptionsOf(view);
    if (p === null || p.seat !== view.viewer || p.mechanism !== mechanism) return false;
    if (opts.nonEmpty === true && p.suggested.length === 0) return false;
    if (opts.spell === undefined) return true;
    return view.stack.some((o) => o.id === p.source && o.name === opts.spell);
  };

export const asksConfirm =
  (purpose: 'mayPay' | 'cascade') =>
  (view: GameView): boolean =>
    view.pending?.kind === 'confirmOptional' &&
    view.pending.purpose === purpose &&
    view.pending.seat === view.viewer;

interface SearchOptions {
  readonly seeds?: number;
  readonly maxClicks?: number;
  /** Cards to cast ahead of the scripted human's own choice (after it has played a land). */
  readonly prefer?: readonly string[];
}

/** The scripted human of `chooseAction`, casting the preferred cards first once it has played its land. */
function answerer(prefer: readonly string[]): (view: GameView, d: PendingDecision) => Action {
  return (view, decision) => {
    if (decision.kind === 'priority' && prefer.length > 0) {
      if (!decision.options.some((o) => o.kind === 'playLand')) {
        const hand = view.seats[view.viewer]?.hand ?? [];
        for (const name of prefer) {
          const option = decision.options.find(
            (o) => o.kind === 'castSpell' && hand.some((c) => c.id === o.object && c.name === name),
          );
          if (option !== undefined) return option;
        }
      }
    }
    return chooseAction(view, decision);
  };
}

export async function reachKeywords2(
  accept: (view: GameView) => boolean,
  opts: SearchOptions = {},
): Promise<{ host: GameHost; snap: Snapshot; seed: number } | null> {
  const { seeds = 120, maxClicks = 600, prefer = [] } = opts;
  const answer = answerer(prefer);
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: KEYWORDS2_DECK, aiDeck: 'swamp-forest' }))
      .snapshot;
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = snap.view;
      if (view.result !== null || view.pending === null) break;
      if (accept(view)) return { host, snap, seed };
      const next = await host.act(answer(view, view.pending));
      if (next.error !== null) break;
      snap = next;
    }
  }
  return null;
}

export type Keywords2Store = ReturnType<typeof createAppStore>;

/** The same search through the page's store (with its autopilot), for the render tests. */
export async function reachKeywords2Store(
  accept: (view: GameView) => boolean,
  opts: SearchOptions = {},
): Promise<Keywords2Store | null> {
  const { seeds = 120, maxClicks = 600, prefer = [] } = opts;
  const answer = answerer(prefer);
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: KEYWORDS2_DECK, aiDeck: 'swamp-forest' });
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (accept(view)) return store;
      const before = store.getState().snapshot?.revision;
      await store.getState().act(answer(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}

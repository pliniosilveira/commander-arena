/**
 * The hidden SYNTHETIC deck `synthetic-angels` (game/precons.ts: invented engine fixtures, not real cards) through the page's store,
 * and a search for a seed whose game reaches a situation of the Angels slice (D-149): the tax on blocking, proliferate, a spell cast
 * by tapping creatures. A scripted human casts the cards the test wants as soon as it can, plays lands, puts Mana Birds on the
 * battlefield (fliers to block with and to tap) and passes otherwise; `accept` says when to stop.
 */
import type { Action, GameView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const ANGELS_DECK = 'synthetic-angels';

export type AngelsStore = ReturnType<typeof createAppStore>;

/**
 * The scripted answer: a card matching `want` is cast the moment it can be, then a land is played, then a Mana Bird (or the card
 * `fodder` names) is cast so there are creatures; anything else is passed. Every other decision is answered by the bot.
 */
export function scripted(
  want: RegExp,
  fodder: RegExp = /Mana Bird/,
): (view: GameView, decision: PendingDecision) => Action {
  return (view, decision) => {
    if (decision.kind !== 'priority') return chooseAction(view, decision);
    const hand = new Map((view.seats[view.viewer]?.hand ?? []).map((o) => [o.id, o.name]));
    const named = (re: RegExp) =>
      decision.options.find((o) => o.kind === 'castSpell' && re.test(hand.get(o.object) ?? ''));
    return (
      named(want) ??
      decision.options.find((o) => o.kind === 'playLand') ??
      named(fodder) ?? { kind: 'pass' }
    );
  };
}

export async function reachAngelsStore(
  accept: (view: GameView) => boolean,
  want: RegExp,
  opts: {
    seeds?: number;
    maxClicks?: number;
    human?: string;
    ai?: string;
    fodder?: RegExp;
    from?: number;
    /** Mana is paid by hand, so a payment is a question to answer (the page's "Manual mana"). */
    manual?: boolean;
  } = {},
): Promise<{ store: AngelsStore; seed: number } | null> {
  const { seeds = 60, maxClicks = 600, human = ANGELS_DECK, ai = ANGELS_DECK, from = 1 } = opts;
  const choose = scripted(want, opts.fodder);
  for (let seed = from; seed < from + seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    store.getState().setManualPay(opts.manual === true);
    await store.getState().startGame({ seed, humanDeck: human, aiDeck: ai });
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (accept(view)) return { store, seed };
      const before = store.getState().snapshot?.revision;
      await store.getState().act(choose(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}

/** The viewer is declaring blockers and something taxes blocking (CR 509.1d). */
export const asksBlockTax = (view: GameView) =>
  view.pending?.kind === 'declareBlockers' &&
  view.pending.blockCost !== undefined &&
  view.pending.candidates.length > 0;

/** The viewer chooses what to proliferate (CR 701.34a). */
export const asksProliferate = (view: GameView) =>
  view.pending?.kind === 'choosePermanent' && view.pending.purpose === 'proliferate';

/** The viewer chooses which creatures to tap to cast a spell by its alternative cost (CR 118.9). */
export const asksSpellTap = (view: GameView) => {
  const asked = view.pending;
  return (
    asked?.kind === 'choosePermanent' &&
    asked.purpose === 'tap' &&
    asked.forCost === true &&
    view.stack.some((o) => o.id === asked.source && o.abilitySource === undefined)
  );
};

/**
 * The hidden SYNTHETIC decks `synthetic-dragons` and `synthetic-dragons-early` (game/precons.ts: invented engine fixtures, not real
 * cards) through the page's store, and a search for a seed whose game reaches a situation of the Dragons slice (D-151): the chapter a
 * Saga with read ahead starts with, a Behold that lists cards of the hand and permanents, the discard of any number of cards, a card
 * exiled to be played, the top card of the library cast, paying any amount of a symbol. A scripted human casts the cards the test wants
 * as soon as it can, plays lands, puts the filler on the battlefield and passes otherwise; `accept` says when to stop.
 */
import type { Action, GameView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const DRAGONS_DECK = 'synthetic-dragons';
export const DRAGONS_EARLY = 'synthetic-dragons-early';

export type DragonsStore = ReturnType<typeof createAppStore>;

/** The decision the viewer is asked now. */
const asked = (view: GameView): PendingDecision | null => view.pending;

/**
 * The scripted answer: a card matching `want` is cast the moment it can be, then a land is played, then a card matching `filler` is
 * cast so there are permanents; anything else is passed. Every other decision is answered by `others` (the plain bot by default).
 */
export function scripted(
  want: RegExp,
  filler: RegExp = /Plain Drake/,
  others: (view: GameView, decision: PendingDecision) => Action = chooseAction,
): (view: GameView, decision: PendingDecision) => Action {
  return (view, decision) => {
    if (decision.kind !== 'priority') return others(view, decision);
    const hand = new Map((view.seats[view.viewer]?.hand ?? []).map((o) => [o.id, o.name]));
    const named = (re: RegExp) =>
      decision.options.find((o) => o.kind === 'castSpell' && re.test(hand.get(o.object) ?? ''));
    return (
      named(want) ??
      decision.options.find((o) => o.kind === 'playLand' && hand.has(o.object)) ??
      named(filler) ?? { kind: 'pass' }
    );
  };
}

export async function reachDragonsStore(
  accept: (view: GameView) => boolean,
  want: RegExp,
  opts: {
    seeds?: number;
    maxClicks?: number;
    human?: string;
    ai?: string;
    filler?: RegExp;
    from?: number;
    others?: (view: GameView, decision: PendingDecision) => Action;
    /** Mana is paid by hand, so a payment is a question to answer (the page's "Manual mana"). */
    manual?: boolean;
  } = {},
): Promise<{ store: DragonsStore; seed: number } | null> {
  const { seeds = 60, maxClicks = 600, human = DRAGONS_EARLY, ai = DRAGONS_EARLY, from = 1 } = opts;
  const choose = scripted(want, opts.filler, opts.others);
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

/** The viewer chooses the chapter a Saga with read ahead starts with (CR 702.155b). */
export const asksChapter = (view: GameView) => {
  const d = asked(view);
  return (
    d?.kind === 'chooseOption' && d.purpose === 'option' && d.options.every((o) => /^\d+$/.test(o))
  );
};

/** The viewer chooses a name the card gives ("Khans or Dragons"). */
export const asksNamedOption = (view: GameView) => {
  const d = asked(view);
  return (
    d?.kind === 'chooseOption' && d.purpose === 'option' && !d.options.every((o) => /^\d+$/.test(o))
  );
};

/** The viewer beholds a Dragon (CR 701.4a). */
export const asksBehold = (view: GameView) => {
  const d = asked(view);
  return d?.kind === 'chooseCards' && d.purpose === 'behold';
};

/** The viewer beholds and has cards of the hand and permanents to choose from. */
export const asksBeholdBoth = (view: GameView) => {
  const d = asked(view);
  if (d?.kind !== 'chooseCards' || d.purpose !== 'behold') return false;
  const hand = new Set((view.seats[view.viewer]?.hand ?? []).map((o) => o.id));
  return d.legal.some((id) => hand.has(id)) && d.legal.some((id) => !hand.has(id));
};

/** The viewer discards any number of cards (CR 701.9). */
export const asksAnyDiscard = (view: GameView) => {
  const d = asked(view);
  return d?.kind === 'chooseCards' && d.purpose === 'discard' && d.min === 0 && d.max > 0;
};

/** The viewer pays any amount of a symbol (CR 118.1). */
export const asksPayAny = (view: GameView) => {
  const d = asked(view);
  return d?.kind === 'chooseX' && d.purpose === 'payAnyAmount';
};

/** The viewer may play a card from exile ("You may play that card this turn"). */
export const mayPlayFromExile = (view: GameView) => {
  const d = asked(view);
  if (d?.kind !== 'priority') return false;
  const exiled = new Set(view.exile.map((o) => o.id));
  return d.options.some(
    (o) => (o.kind === 'castSpell' || o.kind === 'playLand') && exiled.has(o.object),
  );
};

/** The viewer may cast the top card of their library. */
export const mayCastFromTop = (view: GameView) => {
  const d = asked(view);
  const top = view.seats[view.viewer]?.libraryTop;
  if (d?.kind !== 'priority' || top === undefined) return false;
  return d.options.some((o) => o.kind === 'castSpell' && o.object === top.id);
};

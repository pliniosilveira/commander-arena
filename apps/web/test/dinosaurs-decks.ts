/**
 * The hidden SYNTHETIC deck `synthetic-dinosaurs` (game/precons.ts: invented engine fixtures, not real cards) through the page's
 * store, and a search for a seed whose game reaches a situation: the division of damage among targets, the Hideaway look,
 * the play of the exiled card, a fight or a free cast. A scripted human casts the cards the test wants as soon as it can, plays
 * lands and puts creatures on the battlefield, and passes otherwise; `accept` says when to stop.
 */
import type { Action, GameView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const DINOSAURS_DECK = 'synthetic-dinosaurs';

export type DinosaursStore = ReturnType<typeof createAppStore>;

/**
 * The scripted answer: a card matching `want` is cast the moment it can be, then a land is played, then a creature (a Bear, a Goblin,
 * a Dinosaur) is cast so there is something to target; anything else is passed. Every other decision is answered by the bot.
 */
export function scripted(want: RegExp): (view: GameView, decision: PendingDecision) => Action {
  return (view, decision) => {
    if (decision.kind !== 'priority') return chooseAction(view, decision);
    const hand = new Map((view.seats[view.viewer]?.hand ?? []).map((o) => [o.id, o.name]));
    const named = (re: RegExp) =>
      decision.options.find((o) => o.kind === 'castSpell' && re.test(hand.get(o.object) ?? ''));
    return (
      named(want) ??
      decision.options.find((o) => o.kind === 'playLand') ??
      named(/Grizzly|Goblin|Dinosaur/) ?? { kind: 'pass' }
    );
  };
}

export async function reachDinosaursStore(
  accept: (view: GameView) => boolean,
  want: RegExp,
  opts: { seeds?: number; maxClicks?: number; human?: string; ai?: string } = {},
): Promise<DinosaursStore | null> {
  const { seeds = 60, maxClicks = 500, human = DINOSAURS_DECK, ai = 'swamp-forest' } = opts;
  const choose = scripted(want);
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: human, aiDeck: ai });
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (accept(view)) return store;
      const before = store.getState().snapshot?.revision;
      await store.getState().act(choose(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}

/** The viewer divides damage among the targets of a spell being cast. */
export const asksDivide = (view: GameView) =>
  view.pending?.kind === 'targets' && view.pending.specs.some((s) => s.divide !== undefined);

/** The viewer looks at the top cards for Hideaway: a card must be taken, and goes into exile face down. */
export const asksHideaway = (view: GameView) =>
  view.pending?.kind === 'chooseCards' &&
  view.pending.purpose === 'lookTake' &&
  view.pending.min === 1;

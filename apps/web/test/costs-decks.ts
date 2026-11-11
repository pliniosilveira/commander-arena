/**
 * The hidden SYNTHETIC deck `synthetic-costs` (game/precons.ts: invented engine fixtures, not real
 * cards) through the game host or the page's store, and a search for a seed whose game reaches a
 * situation. A scripted human plays lands and the cards `play` allows (creatures and Sol Rings by
 * default) and keeps every other card in the hand until a scenario casts it on purpose; it plays
 * on until `accept` says stop. Scenarios: a sacrifice cost, a discard cost that is cancelled, a
 * reduced cost and a free cast with the commander on the battlefield (D-095, D-101).
 */
import type { Action, GameView, ObjectView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';
import {
  handOf,
  hostSession,
  priorityOf,
  type Session,
  storeSession,
  type WardStore,
} from './ward-decks';

export const COSTS_DECK = 'synthetic-costs';
/** The opponent: a plain deck whose cards ask the human nothing. */
export const COSTS_OPPONENT = 'swamp-forest';

export type Play = (card: ObjectView) => boolean;

/** Creatures and Sol Rings: what the scripted human casts unless a scenario says otherwise. */
export const PLAIN: Play = (c) => c.types.includes('creature') || c.name === 'Sol Ring';

/** The scripted human: lands, then the cards `play` allows (the commander included); every other card stays in the hand. */
export function costsBot(play: Play, view: GameView, decision: PendingDecision): Action {
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  const land = decision.options.find((o) => o.kind === 'playLand');
  if (land !== undefined) return land;
  // The commander is cast from the command zone like any other card.
  const cards = [...handOf(view), ...(view.seats[view.viewer]?.command ?? [])];
  const spell = decision.options.find(
    (o) =>
      o.kind === 'castSpell' &&
      o.alternative === undefined &&
      cards.some((c) => c.id === o.object && play(c)),
  );
  return spell ?? { kind: 'pass' };
}

/** The viewer's castable card with this name, as the options that cast it (one per way to cast). */
export function castOptions(
  view: GameView,
  name: string,
): Extract<Action, { kind: 'castSpell' }>[] {
  const priority = priorityOf(view);
  const card = handOf(view).find((c) => c.name === name);
  if (priority === null || card === undefined) return [];
  return priority.options.filter(
    (o): o is Extract<Action, { kind: 'castSpell' }> =>
      o.kind === 'castSpell' && o.object === card.id,
  );
}

/** The viewer's own creatures on the battlefield. */
export const myCreatures = (view: GameView): readonly ObjectView[] =>
  view.battlefield.filter((o) => o.controller === view.viewer && o.types.includes('creature'));

/** The viewer's untapped lands and Sol Rings, counted as sources. */
export const myUntapped = (view: GameView): number =>
  view.battlefield.filter(
    (o) =>
      o.controller === view.viewer &&
      !o.tapped &&
      (o.types.includes('land') || o.name === 'Sol Ring'),
  ).length;

export const onBattlefield = (view: GameView, name: string): ObjectView | undefined =>
  view.battlefield.find((o) => o.controller === view.viewer && o.name === name);

/** A game of the costs deck against `swamp-forest`, played by the scripted human until `accept`. */
export async function searchCosts(
  start: (seed: number) => Promise<Session>,
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number; play?: Play } = {},
): Promise<{ session: Session; seed: number } | null> {
  const { seeds = 60, maxClicks = 500, play = PLAIN } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const session = await start(seed);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view)) return { session, seed };
      if ((await session.act(costsBot(play, view, view.pending))) === null) break;
    }
  }
  return null;
}

export const startHost = async (seed: number): Promise<Session & { host: GameHost }> => {
  const host = new GameHost({ clock: () => 0 });
  const first = (await host.newGame({ seed, humanDeck: COSTS_DECK, aiDeck: COSTS_OPPONENT }))
    .snapshot;
  return { ...hostSession(host, first), host };
};

export const startStore = async (seed: number): Promise<Session & { store: WardStore }> => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed, humanDeck: COSTS_DECK, aiDeck: COSTS_OPPONENT });
  return { ...storeSession(store), store };
};

/** Sends the action and fails the test when the engine refuses it. */
export async function must(session: Session, action: Action) {
  const next = await session.act(action);
  if (next === null) throw new Error(`the engine refused ${action.kind}`);
  return next;
}

/** Casts the card the way a click does and pays with Auto-pay; resolves to the next question. */
export async function castAndPay(session: Session, option: Action) {
  let snap = await must(session, option);
  if (snap.view.pending?.kind === 'payMana') snap = await must(session, { kind: 'payAuto' });
  return snap;
}

/** Ward—Discard a card is the opponent's: the human plays the instants deck against the costs deck. */
export const startWardHost = async (seed: number): Promise<Session & { host: GameHost }> => {
  const host = new GameHost({ clock: () => 0 });
  const first = (await host.newGame({ seed, humanDeck: 'instants', aiDeck: COSTS_DECK })).snapshot;
  return { ...hostSession(host, first), host };
};

export const startWardStore = async (seed: number): Promise<Session & { store: WardStore }> => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed, humanDeck: 'instants', aiDeck: COSTS_DECK });
  return { ...storeSession(store), store };
};

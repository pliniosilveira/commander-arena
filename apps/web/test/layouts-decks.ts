/**
 * The hidden SYNTHETIC deck `synthetic-layouts` (game/precons.ts: invented engine fixtures, not
 * real cards) through the game host or the page's store, and a search for a seed whose game reaches
 * a situation with a split, Adventure, modal double-faced or transforming card. A scripted human
 * plays lands only and passes (every spell is cast on purpose by a scenario), until `accept` says
 * stop. Faces are named without the "SYNTHETIC " prefix in the view: "Study // Zap" in the hand,
 * "Zap" on the stack, "Moon Beast" on the battlefield after the transform.
 */
import type {
  Action,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
  PriorityDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { objectIndex } from '../src/ui/decisions/lookup';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi } from '../src/ui/decisions/ui-state';
import { chooseAction } from './bot';
import {
  handOf,
  hostSession,
  priorityOf,
  type Session,
  storeSession,
  type WardStore,
} from './ward-decks';

export const LAYOUTS_DECK = 'synthetic-layouts';
export { handOf, priorityOf, type Session };

type CastOrPlay = Extract<PriorityOption, { kind: 'castSpell' | 'playLand' }>;

/** The scripted human: lands first, then nothing but passes (and the plain answers). */
export function layoutsBot(view: GameView, decision: PendingDecision): Action {
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  const land = decision.options.find((o) => o.kind === 'playLand');
  return land ?? { kind: 'pass' };
}

/** The scripted human of `layoutsBot`, except that it never plays a modal card's land face. */
export function basicLandBot(view: GameView, decision: PendingDecision): Action {
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  const hand = handOf(view);
  const land = decision.options.find(
    (o) => o.kind === 'playLand' && hand.some((c) => c.id === o.object && c.layout === undefined),
  );
  return land ?? { kind: 'pass' };
}

/** `layoutsBot` that also casts a Moon Cub whenever it can (it transforms at its upkeep). */
export function moonBot(view: GameView, decision: PendingDecision): Action {
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  const cub = handOf(view).find((c) => c.name === 'Moon Cub');
  const cast = decision.options.find(
    (o) => o.kind === 'castSpell' && cub !== undefined && o.object === cub.id,
  );
  return cast ?? layoutsBot(view, decision);
}

/** The cast and play options the decision lists for the card of this name in the viewer's hand. */
export function optionsFor(view: GameView, name: string): CastOrPlay[] {
  const priority = priorityOf(view);
  const card = handOf(view).find((c) => c.name === name);
  if (priority === null || card === undefined) return [];
  return priority.options.filter(
    (o): o is CastOrPlay =>
      (o.kind === 'castSpell' || o.kind === 'playLand') && o.object === card.id,
  );
}

/** The viewer has priority and these faces of the hand card are listed (as `kind face` pairs). */
export const offers =
  (name: string, ...wanted: readonly string[]) =>
  (view: GameView): boolean => {
    const found = optionsFor(view, name).map((o) => `${o.kind} ${o.face ?? 0}`);
    return wanted.every((w) => found.includes(w));
  };

/** The viewer has priority and exactly these faces of the hand card are listed. */
export const offersOnly =
  (name: string, ...wanted: readonly string[]) =>
  (view: GameView): boolean => {
    const found = optionsFor(view, name).map((o) => `${o.kind} ${o.face ?? 0}`);
    return found.length === wanted.length && wanted.every((w) => found.includes(w));
  };

/** A game of the layouts deck against a quiet opponent, played by `bot` until `accept`. */
export async function searchLayouts(
  start: (seed: number) => Promise<Session>,
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number; bot?: typeof layoutsBot } = {},
): Promise<{ session: Session; seed: number } | null> {
  const { seeds = 80, maxClicks = 500, bot = layoutsBot } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const session = await start(seed);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view)) return { session, seed };
      if ((await session.act(bot(view, view.pending))) === null) break;
    }
  }
  return null;
}

export const startHost = async (seed: number): Promise<Session & { host: GameHost }> => {
  const host = new GameHost({ clock: () => 0 });
  const first = (await host.newGame({ seed, humanDeck: LAYOUTS_DECK, aiDeck: 'swamp-forest' }))
    .snapshot;
  return { ...hostSession(host, first), host };
};

export const startStore = async (seed: number): Promise<Session & { store: WardStore }> => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed, humanDeck: LAYOUTS_DECK, aiDeck: 'swamp-forest' });
  return { ...storeSession(store), store };
};

export async function must(session: Session, action: Action): Promise<Snapshot> {
  const next = await session.act(action);
  if (next === null) throw new Error(`the engine refused ${action.kind}`);
  return next;
}

/** What a click on the object sends or opens at priority, through the page's model. */
export function clickOn(view: GameView, id: ObjectId): { acts: Action[]; chooser: string[] } {
  const pending = view.pending;
  if (pending === null) throw new Error('nothing pending');
  const acts: Action[] = [];
  const chooser: string[] = [];
  const ctl: Controller = {
    act: (a) => acts.push(a),
    update: () => {},
    openChooser: (object) => chooser.push(object),
  };
  buildModel(view, pending, initialUi(pending), ctl).interaction.onObject(id);
  return { acts, chooser };
}

/** The card of this name in the viewer's hand. */
export function inHand(view: GameView, name: string): ObjectView {
  const card = handOf(view).find((c) => c.name === name);
  if (card === undefined) throw new Error(`no ${name} in hand`);
  return card;
}

/** Pays for what is being cast: targets answered with the first legal one, then Auto-pay. */
export async function finishCast(session: Session): Promise<Snapshot> {
  let snap = session.snapshot();
  for (let i = 0; i < 4; i += 1) {
    const pending = snap.view.pending;
    if (pending === null || pending.kind === 'priority') break;
    snap = await must(session, chooseAction(snap.view, pending));
  }
  return snap;
}

/** Passes (as the Resolve button does) until the stack is empty again; returns the last snapshot. */
export async function resolveAll(session: Session): Promise<Snapshot> {
  let snap = session.snapshot();
  for (let i = 0; i < 40 && snap.view.stack.length > 0; i += 1) {
    const pending = snap.view.pending;
    if (pending === null) break;
    snap = await must(
      session,
      pending.kind === 'priority' ? { kind: 'pass' } : chooseAction(snap.view, pending),
    );
  }
  return snap;
}

/** The viewer's exile cards on an Adventure, with the priority options that cast them. */
export function adventureCards(view: GameView): ObjectView[] {
  return view.exile.filter((o) => o.owner === view.viewer && o.onAdventure === true);
}

/** The index of a view's objects (for the labels of the chooser). */
export const indexOf = (view: GameView) => objectIndex(view);

/** A priority decision, or an error when the viewer is asked something else. */
export function mustPriority(view: GameView): PriorityDecision {
  const priority = priorityOf(view);
  if (priority === null) throw new Error(`expected priority, got ${view.pending?.kind}`);
  return priority;
}

/**
 * The hidden SYNTHETIC deck `synthetic-references` (game/precons.ts: invented engine fixtures, not
 * real cards) through the game host or the page's store, and a search for a seed whose game
 * reaches a situation. A scripted human plays basic lands and creatures only (every other card
 * stays in the hand until a scenario plays it on purpose), until `accept` says stop. The AI
 * answers for itself: it casts a SYNTHETIC Soft Counter at the human's spell, and a SYNTHETIC
 * Banish Seek Land (a Path to Exile shape) at the human's creature, whenever it can.
 */
import type { Action, GameView, ObjectView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';
import { hostSession, manaAvailable, type Session, storeSession } from './ward-decks';

export const REFERENCES_DECK = 'synthetic-references';

export type RefStore = ReturnType<typeof createAppStore>;
export type { Session };

const handOf = (view: GameView): readonly ObjectView[] => view.seats[view.viewer]?.hand ?? [];

export interface BotOptions {
  /** A creature is cast only with at least this much mana available (spare mana for a payment). */
  readonly creatureMana?: number;
  /** Play a SYNTHETIC Bounce Land as soon as the viewer has two other lands. */
  readonly bounce?: boolean;
}

/** The scripted human: basic lands first, then creatures; every other card stays in the hand. */
export function refBot(view: GameView, decision: PendingDecision, opts: BotOptions = {}): Action {
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  const hand = handOf(view);
  const lands = view.battlefield.filter(
    (o) => o.controller === view.viewer && o.types.includes('land'),
  ).length;
  const playable = decision.options.filter((o) => o.kind === 'playLand');
  const named = (o: (typeof playable)[number]) =>
    o.kind === 'playLand' ? hand.find((c) => c.id === o.object)?.name : undefined;
  if (opts.bounce === true && lands >= 2) {
    const bounce = playable.find((o) => named(o) === 'SYNTHETIC Bounce Land');
    if (bounce !== undefined) return bounce;
  }
  const basic = playable.find((o) => named(o) !== 'SYNTHETIC Bounce Land');
  if (basic !== undefined) return basic;
  const need = opts.creatureMana ?? 0;
  if (manaAvailable(view) >= need) {
    const creature = decision.options.find(
      (o) =>
        o.kind === 'castSpell' &&
        hand.some((c) => c.id === o.object && c.types.includes('creature')),
    );
    if (creature !== undefined) return creature;
  }
  return { kind: 'pass' };
}

/** A game of the references deck against the same deck, played by the scripted human until `accept`. */
export async function searchRefs(
  start: (seed: number) => Promise<Session>,
  accept: (view: GameView) => boolean,
  opts: BotOptions & { seeds?: number; maxClicks?: number; from?: number } = {},
): Promise<{ session: Session; seed: number } | null> {
  const { seeds = 60, maxClicks = 600, from = 1 } = opts;
  for (let seed = from; seed < from + seeds; seed += 1) {
    const session = await start(seed);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view)) return { session, seed };
      if ((await session.act(refBot(view, view.pending, opts))) === null) break;
    }
  }
  return null;
}

export const startHost = async (seed: number): Promise<Session & { host: GameHost }> => {
  const host = new GameHost({ clock: () => 0 });
  const first = (await host.newGame({ seed, humanDeck: REFERENCES_DECK, aiDeck: REFERENCES_DECK }))
    .snapshot;
  return { ...hostSession(host, first), host };
};

export const startStore = async (seed: number): Promise<Session & { store: RefStore }> => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed, humanDeck: REFERENCES_DECK, aiDeck: REFERENCES_DECK });
  return { ...storeSession(store), store };
};

/** The question of "counter target spell unless its controller pays", asked of the human. */
export function counterAsk(view: GameView): boolean {
  const p = view.pending;
  return p?.kind === 'confirmOptional' && p.purpose === 'counterUnlessPays';
}

/** The "may search" question, asked of the human. */
export function searchAsk(view: GameView): boolean {
  const p = view.pending;
  return p?.kind === 'confirmOptional' && p.purpose === 'search';
}

/** A bounce land's choice among the lands the human controls. */
export function bounceAsk(view: GameView): boolean {
  const p = view.pending;
  return p?.kind === 'choosePermanent' && p.purpose === 'effect';
}

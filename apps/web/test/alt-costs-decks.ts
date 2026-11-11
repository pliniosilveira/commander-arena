/**
 * The hidden SYNTHETIC decks `synthetic-overload`, `synthetic-evoke`, `synthetic-dash`,
 * `synthetic-dash-commander`, `synthetic-spectacle`, `synthetic-escape` and `synthetic-unearth` (game/precons.ts: invented engine fixtures, not real cards) through the
 * game host, and a search for a seed whose game reaches a situation. The scripted human plays lands
 * and nothing else (every spell stays in the hand until a scenario casts it on purpose) and passes,
 * until `accept` says stop (D-121).
 */
import type {
  Action,
  GameView,
  ObjectId,
  ObjectView,
  PriorityDecision,
} from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { chooseAction } from './bot';
import { handOf, hostSession, type Session } from './ward-decks';

export const OPPONENT = 'swamp-forest';

/** Lands first; a decision that is not priority gets the plain answer; otherwise pass. */
export function landBot(view: GameView): Action {
  const decision = view.pending;
  if (decision === null) throw new Error('nothing pending');
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  return decision.options.find((o) => o.kind === 'playLand') ?? { kind: 'pass' };
}

export const priority = (view: GameView): PriorityDecision | null =>
  view.pending?.kind === 'priority' && view.pending.seat === view.viewer ? view.pending : null;

/** The viewer's card in the hand or the command zone with this name. */
export function myCard(view: GameView, name: string): ObjectView | undefined {
  const seat = view.seats[view.viewer];
  return [...handOf(view), ...(seat?.command ?? [])].find((c) => c.name === name);
}

/** The cast options the decision lists for the viewer's card with this name. */
export function castOptionsOf(
  view: GameView,
  name: string,
): Extract<PriorityDecision['options'][number], { kind: 'castSpell' }>[] {
  const card = myCard(view, name);
  const decision = priority(view);
  if (card === undefined || decision === null) return [];
  return decision.options.filter(
    (o): o is Extract<typeof o, { kind: 'castSpell' }> =>
      o.kind === 'castSpell' && o.object === card.id,
  );
}

/** The viewer's lands on the battlefield. */
export const myLands = (view: GameView): number =>
  view.battlefield.filter((o) => o.controller === view.viewer && o.types.includes('land')).length;

export async function reach(
  deck: string,
  accept: (view: GameView) => boolean,
  seeds = 40,
  bot: (view: GameView) => Action = landBot,
): Promise<{ host: GameHost; session: Session; seed: number }> {
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    const first = (await host.newGame({ seed, humanDeck: deck, aiDeck: OPPONENT })).snapshot;
    const session = hostSession(host, first);
    for (let clicks = 0; clicks < 800; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view)) return { host, session, seed };
      if ((await session.act(bot(view))) === null) break;
    }
  }
  throw new Error(`no seed reaches the situation in ${deck}`);
}

/**
 * A scripted human that keeps its lands in hand until `play` holds (a graveyard to cast from is
 * built by the discard at the end of turn, D-124) and, when the hand is over its limit, discards
 * the cards named `fodder` first. After that it plays lands and passes, as `landBot` does.
 */
export function holdBot(
  play: (view: GameView) => boolean,
  fodder: string,
): (view: GameView) => Action {
  return (view) => {
    const decision = view.pending;
    if (decision === null) throw new Error('nothing pending');
    if (decision.kind === 'discard') {
      const hand = handOf(view);
      const rank = (id: ObjectId) => (hand.find((c) => c.id === id)?.name === fodder ? 0 : 1);
      const objects = [...decision.hand].sort((a, b) => rank(a) - rank(b)).slice(0, decision.count);
      return { kind: 'chooseCards', objects };
    }
    if (decision.kind !== 'priority') return chooseAction(view, decision);
    if (!play(view)) return { kind: 'pass' };
    return decision.options.find((o) => o.kind === 'playLand') ?? { kind: 'pass' };
  };
}

/** The viewer's graveyard. */
export const myGraveyard = (view: GameView): readonly ObjectView[] =>
  view.seats[view.viewer]?.graveyard ?? [];

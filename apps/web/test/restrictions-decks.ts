/**
 * The hidden SYNTHETIC deck `synthetic-restrictions` (game/precons.ts: invented engine fixtures,
 * not real cards) through the game host or the page's store, and a search for a seed whose game
 * reaches a situation: the human is asked to declare attackers with a creature that must attack
 * (CR 508.1d), or to declare blockers against an attacker one of their creatures cannot block
 * (CR 509.1b). The scripted human plays lands and casts creatures, never attacks until `accept`
 * says stop, and blocks nothing.
 */
import type { Action, GameView, PendingDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';
import { hostSession, type Session, storeSession } from './ward-decks';

export const RESTRICTIONS_DECK = 'synthetic-restrictions';

export type RestrictionStore = ReturnType<typeof createAppStore>;
export type { Session };

/** The scripted human: plain answers; no attack, no block. */
export function restrictionBot(view: GameView, decision: PendingDecision): Action {
  if (decision.kind === 'declareAttackers') {
    return {
      kind: 'declareAttackers',
      attacks: decision.mustAttack.flatMap((id) => {
        const target = decision.candidates.find((c) => c.attacker === id)?.targets[0];
        return target === undefined ? [] : [{ attacker: id, target }];
      }),
    };
  }
  return chooseAction(view, decision);
}

export async function searchRestrictions(
  start: (seed: number) => Promise<Session>,
  accept: (view: GameView) => boolean,
  opts: { seed?: number; seeds?: number; maxClicks?: number; from?: number } = {},
): Promise<{ session: Session; seed: number } | null> {
  const { seed, seeds = 60, maxClicks = 700, from = 1 } = opts;
  const candidates = seed === undefined ? Array.from({ length: seeds }, (_, i) => from + i) : [seed];
  for (const candidate of candidates) {
    const session = await start(candidate);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view)) return { session, seed: candidate };
      if ((await session.act(restrictionBot(view, view.pending))) === null) break;
    }
  }
  return null;
}

export const startHost = async (seed: number): Promise<Session & { host: GameHost }> => {
  const host = new GameHost({ clock: () => 0 });
  const first = (
    await host.newGame({ seed, humanDeck: RESTRICTIONS_DECK, aiDeck: RESTRICTIONS_DECK })
  ).snapshot;
  return { ...hostSession(host, first), host };
};

export const startStore = async (seed: number): Promise<Session & { store: RestrictionStore }> => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({
    seed,
    humanDeck: RESTRICTIONS_DECK,
    aiDeck: RESTRICTIONS_DECK,
  });
  return { ...storeSession(store), store };
};

/** The human is asked to declare attackers and a creature of theirs must attack. */
export function mustAttackAsk(view: GameView): boolean {
  const p = view.pending;
  return p?.kind === 'declareAttackers' && p.mustAttack.length > 0;
}

/** The human is asked to declare blockers and an evasive attacker is one a blocker cannot block. */
export function evasionAsk(view: GameView): boolean {
  const p = view.pending;
  if (p?.kind !== 'declareBlockers') return false;
  return p.attackers.some((a) => {
    const o = view.battlefield.find((x) => x.id === a.attacker);
    const evasive =
      o?.restrictions?.includes('cantBeBlocked') === true ||
      o?.keywords.some((k) => ['landwalk', 'fear', 'intimidate', 'shadow'].includes(k)) === true;
    return evasive && p.candidates.some((c) => !c.canBlock.includes(a.attacker));
  });
}

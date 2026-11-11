/**
 * The hidden SYNTHETIC deck `synthetic-mana-plus` (game/precons.ts: invented engine fixtures, not
 * real cards) through the game host, and a search for a seed whose game reaches a situation. The
 * scripted human (`chooseAction`) plays lands and casts spells until `accept` says stop.
 */
import type { ObjectView, PriorityDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { chooseAction } from './bot';

export interface Reached {
  readonly host: GameHost;
  readonly snap: Snapshot;
  readonly seed: number;
}

export async function reachPlus(
  accept: (snap: Snapshot) => boolean,
  opts: { seeds?: number; maxClicks?: number; aiDeck?: string } = {},
): Promise<Reached | null> {
  const { seeds = 80, maxClicks = 400, aiDeck = 'swamp-forest' } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: 'synthetic-mana-plus', aiDeck })).snapshot;
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = snap.view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(snap)) return { host, snap, seed };
      const next = await host.act(chooseAction(view, view.pending));
      if (next.error !== null) break;
      snap = next;
    }
  }
  return null;
}

export const mine = (snap: Snapshot, name: string): ObjectView[] =>
  snap.view.battlefield.filter((o) => o.name === name && o.controller === snap.view.viewer);

/** The human's priority decision, or null. */
export function priorityOf(snap: Snapshot): PriorityDecision | null {
  const p = snap.view.pending;
  return p?.kind === 'priority' && p.seat === snap.view.viewer ? p : null;
}

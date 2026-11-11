/**
 * The hidden SYNTHETIC deck `synthetic-mana` (game/precons.ts: invented engine fixtures, not real
 * cards) through the game host, and a search for a seed whose game reaches a given situation. A
 * scripted human (`chooseAction`) plays lands and casts spells until `accept` says stop.
 */
import type { Action, GameView } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { chooseAction } from './bot';

export async function reachMana(
  accept: (snap: Snapshot) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ host: GameHost; snap: Snapshot; seed: number } | null> {
  const { seeds = 60, maxClicks = 400 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: 'synthetic-mana', aiDeck: 'swamp-forest' }))
      .snapshot;
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

/** The action the model's button with this label sends, as a click would. */
export function pressButton(
  view: GameView,
  label: string,
  edit: (ui: UiState) => UiState = (ui) => ui,
): Action {
  const pending = view.pending;
  if (pending === null) throw new Error('nothing pending');
  const sent: Action[] = [];
  const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
  const model = buildModel(view, pending, edit(initialUi(pending)), ctl);
  model.bar.buttons.find((b) => b.label === label)?.run();
  const action = sent[0];
  if (action === undefined) throw new Error(`the ${label} button sent nothing`);
  return action;
}

/** Names of the sources a payMana decision offers, in the order given. */
export function sourceNames(snap: Snapshot): string[] {
  const p = snap.view.pending;
  if (p?.kind !== 'payMana') return [];
  return p.manaSources.map(
    (m) => snap.view.battlefield.find((o) => o.id === m.object)?.name ?? m.object,
  );
}

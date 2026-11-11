/**
 * The play rules of D-125 as markup: the top card beside the library count of the viewer only, the
 * untap step's checklist dialog, the cost of attacking in the declare panel and the payment dock, and the
 * words of a play-rule ability in the preview panel. Server rendering of the real store with the hidden
 * SYNTHETIC decks (game/precons.ts).
 */
import type { Action, GameView, PendingDecision } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { Board } from '../src/ui/board/Board';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StoreProvider } from '../src/ui/store-context';
import { chooseAction } from './bot';
import { handOf } from './ward-decks';

vi.setConfig({ testTimeout: 60_000 });

type Store = ReturnType<typeof createAppStore>;

function render(store: Store, node: ReactNode): string {
  return renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );
}

/** Lands first, then the named cards; untaps everything and attacks with nothing. */
function play(cast: readonly string[], view: GameView, d: PendingDecision): Action {
  if (d.kind === 'choosePermanent' && d.purpose === 'untap') {
    return { kind: 'choosePermanents', objects: d.legal };
  }
  if (d.kind === 'declareAttackers') return { kind: 'declareAttackers', attacks: [] };
  if (d.kind !== 'priority') return chooseAction(view, d);
  const land = d.options.find((o) => o.kind === 'playLand');
  if (land !== undefined) return land;
  const hand = handOf(view);
  const spell = d.options.find(
    (o) =>
      o.kind === 'castSpell' &&
      o.alternative === undefined &&
      cast.includes(hand.find((c) => c.id === o.object)?.name ?? ''),
  );
  return spell ?? { kind: 'pass' };
}

async function reach(
  decks: [string, string],
  cast: readonly string[],
  accept: (view: GameView) => boolean,
): Promise<Store> {
  for (let seed = 1; seed <= 40; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck: decks[0], aiDeck: decks[1] });
    for (let clicks = 0; clicks < 900; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view)) return store;
      const before = store.getState().snapshot?.revision;
      await store.getState().act(play(cast, view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  throw new Error(`no seed reaches the situation in ${decks[0]}`);
}

const mine = (view: GameView, name: string) =>
  view.battlefield.filter((o) => o.controller === view.viewer && o.name === name);

test('the top card shows in the strip of the viewer and never in the opponent strip', async () => {
  const LENS = 'SYNTHETIC Seer Lens';
  const store = await reach(
    ['synthetic-top-card', 'synthetic-top-card'],
    [LENS],
    (view) => view.pending?.kind === 'priority' && mine(view, LENS).length > 0,
  );
  const view = store.getState().snapshot?.view;
  const top = view?.seats[view.viewer]?.libraryTop;
  if (top === undefined) throw new Error('no top card');
  const html = render(store, <Board />);
  expect(html.match(/data-library-top=/g)).toHaveLength(1);
  expect(html).toContain(`data-library-top="${top.id}"`);
  expect(html).toContain('Top card of your library:');
  // It sits in the viewer's strip, not the opponent's.
  const strips = html.split('board-strip board-strip-');
  const opponent = strips.find((s) => s.startsWith('opp')) ?? '';
  expect(opponent).not.toContain('data-library-top');
});

test('the preview panel says what a play-rule permanent does', async () => {
  const LENS = 'SYNTHETIC Seer Lens';
  const store = await reach(
    ['synthetic-top-card', 'synthetic-top-card'],
    [LENS],
    (view) => view.pending?.kind === 'priority' && mine(view, LENS).length > 0,
  );
  const lens = mine(store.getState().snapshot?.view as GameView, LENS)[0];
  store.setState({ preview: { hovered: lens?.id ?? null, pinned: null } });
  const html = render(store, <PreviewPanel />);
  expect(html).toContain('Rules in words');
  expect(html).toContain('You may look at the top card of your library any time.');
});

test('an additional land drop shows the land plays beside the counts', async () => {
  const SCOUT = 'SYNTHETIC Wandering Scout';
  const store = await reach(
    ['synthetic-extra-land', 'swamp-forest'],
    [SCOUT],
    (view) =>
      view.pending?.kind === 'priority' &&
      mine(view, SCOUT).length > 0 &&
      view.seats[view.viewer]?.landsPlayedThisTurn === 1,
  );
  const html = render(store, <Board />);
  expect(html).toContain('data-land-plays="1/2"');
  // No chip while a seat has the single ordinary drop.
  expect(html.match(/data-land-plays=/g)).toHaveLength(1);
});

test('the untap step is a checklist with every permanent checked', async () => {
  const store = await reach(
    ['synthetic-optional-untap', 'swamp-forest'],
    ['SYNTHETIC Drowsy Rod'],
    (view) =>
      view.pending?.kind === 'choosePermanent' &&
      view.pending.purpose === 'untap' &&
      view.pending.legal.length >= 2,
  );
  const ask = store.getState().snapshot?.view.pending;
  if (ask?.kind !== 'choosePermanent') throw new Error('no untap question');
  const html = render(
    store,
    <DecisionLayer>
      <span />
    </DecisionLayer>,
  );
  expect(html).toContain('Untap during your untap step: choose which of these stay tapped.');
  expect(html.match(/type="checkbox"/g)).toHaveLength(ask.legal.length);
  expect(html.match(/checked=""/g)).toHaveLength(ask.legal.length);
  expect(html).toContain('Untap all');
  expect(html).toContain('SYNTHETIC Drowsy Land 1');
  // It is not the sacrifice panel.
  expect(html).not.toContain('Sacrifice');
});

test('the declare panel shows the cost per target; the payment says what to pay and how to go back', async () => {
  const GATE = 'SYNTHETIC Tax Gate';
  const store = await reach(
    ['synthetic-hasty-goblins', 'synthetic-attack-tax'],
    ['Raging Goblin'],
    (view) => {
      const d = view.pending;
      return (
        d?.kind === 'declareAttackers' &&
        view.battlefield.some((o) => o.name === GATE && o.controller !== view.viewer) &&
        d.candidates.length >= 2 &&
        (d.attackCosts?.[0]?.affordable ?? 0) >= 2
      );
    },
  );
  store.setState({ manualPay: true });
  let html = render(
    store,
    <DecisionLayer>
      <span />
    </DecisionLayer>,
  );
  expect(html).toContain('Cost of attacking');
  expect(html).toContain('Attacking Opponent costs');
  expect(html).toContain('for each creature.');

  const asked = store.getState().snapshot?.view.pending;
  if (asked?.kind !== 'declareAttackers') throw new Error('no declaration');
  const target = asked.attackCosts?.[0]?.target;
  if (target === undefined) throw new Error('no taxed target');
  await store.getState().act({
    kind: 'declareAttackers',
    attacks: asked.candidates.slice(0, 2).map((c) => ({ attacker: c.attacker, target })),
  });
  expect(store.getState().snapshot?.view.pending?.kind).toBe('payMana');
  html = render(
    store,
    <DecisionLayer>
      <span />
    </DecisionLayer>,
  );
  expect(html).toContain(
    'Pay {2} per attacking creature (4 total) so these creatures can attack: tap your mana sources.',
  );
  expect(html).toContain('Choose other attackers');
  expect(html).toContain('will attack once this is paid');
  expect(html).not.toContain("Don't pay");
});

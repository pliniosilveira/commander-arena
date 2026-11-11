import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { Board } from '../src/ui/board/Board';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { type Interaction, InteractionProvider, NO_INTERACTION } from '../src/ui/interaction';
import { StoreProvider } from '../src/ui/store-context';
import { playThrough } from './bot';

const options = { seed: 11, humanDeck: 'white-knights', aiDeck: 'swamp-forest' };

async function gameAfter(clicks: number) {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame(options);
  if (clicks > 0) await playThrough(store, clicks);
  return store;
}

/**
 * zustand renders the server snapshot from `getInitialState`, which ignores later updates; the
 * wrapper makes the current state the one that renders.
 */
function render(store: Awaited<ReturnType<typeof gameAfter>>, node: ReactNode, ix?: Interaction) {
  const tree =
    ix === undefined ? node : <InteractionProvider value={ix}>{node}</InteractionProvider>;
  return renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{tree}</StoreProvider>,
  );
}

function attr(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]+)"`, 'g'))].map((m) => m[1] ?? '');
}

describe('Board, the active player (D-153)', () => {
  const withActive = (store: Awaited<ReturnType<typeof gameAfter>>, activeSeat: number) => {
    const snap = store.getState().snapshot;
    if (snap === null) throw new Error('no snapshot');
    store.setState({ snapshot: { ...snap, view: { ...snap.view, activeSeat, prioritySeat: 1 } } });
  };

  test("the viewer's turn marks their strip, battlefield and hand; the other area stays idle", async () => {
    const store = await gameAfter(0);
    withActive(store, 0);
    const html = render(store, <Board />);
    expect(html).toContain('aria-label="Your battlefield, your turn"');
    expect(html).toContain('aria-label="Opponent&#x27;s battlefield"');
    expect(html).toMatch(/board-field board-field-me is-active-area/);
    expect(html).toMatch(/board-field board-field-opp is-idle-area/);
    expect(html).toMatch(/board-strip board-strip-me is-active is-active-area/);
    expect(html).toMatch(/board-strip board-strip-opp is-idle-area/);
    expect(html).toMatch(/board-hand is-active-area/);
    // The badges stay: "Turn" on the active strip and "Priority" on the one that holds it, which is
    // the other one here: the highlight follows the turn, not priority.
    expect(html).toContain('board-flag-turn');
    expect(html).toContain('board-flag-priority');
  });

  test("the opponent's turn moves the highlight to their area and takes it off the hand", async () => {
    const store = await gameAfter(0);
    withActive(store, 1);
    const html = render(store, <Board />);
    expect(html).toContain('aria-label="Opponent&#x27;s battlefield, opponent&#x27;s turn"');
    expect(html).toContain('aria-label="Your battlefield"');
    expect(html).toMatch(/board-field board-field-opp is-active-area/);
    expect(html).toMatch(/board-field board-field-me is-idle-area/);
    expect(html).toMatch(/board-strip board-strip-opp is-active is-active-area/);
    expect(html).toMatch(/board-hand is-idle-area/);
    expect(html).not.toMatch(/board-hand is-active-area/);
  });

  test('the log says whose turn begins and its round', async () => {
    const store = await gameAfter(24);
    const lines = store
      .getState()
      .log.filter((e) => /turn \d+ begins\.$/.test(e.text))
      .map((e) => e.text);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/^(Your|Opponent's) turn 1 begins\.$/);
    // Two players: the second turn of the game is still round 1.
    if (lines.length > 1) expect(lines[1]).toMatch(/^(Your|Opponent's) turn 1 begins\.$/);
  });
});

describe('Board', () => {
  test('draws strips, hand and battlefield with the ids other panels look up', async () => {
    const store = await gameAfter(24);
    const view = store.getState().snapshot?.view;
    if (view === undefined) throw new Error('no view');
    expect(view.battlefield.length).toBeGreaterThan(0);

    const html = render(store, <Board />);
    const ids = new Set(attr(html, 'data-object-id'));
    for (const card of view.seats[0]?.hand ?? []) expect(ids.has(card.id)).toBe(true);
    for (const permanent of view.battlefield) expect(ids.has(permanent.id)).toBe(true);
    expect(attr(html, 'data-seat').sort()).toEqual(['0', '1']);
  });

  test('the opponent hand is only a count: no card of it is drawn or named', async () => {
    const store = await gameAfter(24);
    const view = store.getState().snapshot?.view;
    const opponent = view?.seats[1];
    if (view === undefined || opponent === undefined) throw new Error('no view');
    expect(opponent.hand).toBeNull();
    const html = render(store, <Board />);
    expect(html).toContain(`aria-label="${opponent.handCount} cards in hand"`);
    const drawn = new Set(attr(html, 'data-object-id'));
    const knownToViewer = new Set<string>([
      ...view.battlefield.map((o) => o.id),
      ...view.exile.map((o) => o.id),
      ...view.seats
        .flatMap((s) => [...s.graveyard, ...s.command, ...(s.hand ?? [])])
        .map((o) => o.id),
    ]);
    for (const id of drawn) expect(knownToViewer.has(id)).toBe(true);
  });

  test('the strips show life, library, graveyard and the command zone with tax and damage', async () => {
    const store = await gameAfter(0);
    const html = render(store, <Board />);
    expect(html).toContain('board-life-total');
    expect(html).toContain('Library');
    expect(html).toContain('Graveyard');
    expect(html).toContain('Exile (shared)');
    expect(html).toContain('Tax +0');
    expect(html).toContain('Cmdr dmg 0');
    expect(html).toContain('Isamaru, Hound of Konda');
    expect(html).toContain('Yargle, Glutton of Urborg');
  });

  test('the interaction contract drives glow, selection and dimming', async () => {
    const store = await gameAfter(0);
    const view = store.getState().snapshot?.view;
    const [first, second, third] = view?.seats[0]?.hand ?? [];
    if (first === undefined || second === undefined || third === undefined) throw new Error('hand');
    const html = render(store, <Board />, {
      ...NO_INTERACTION,
      clickable: new Set([first.id]),
      selected: new Set([second.id]),
      clickableSeats: new Set([1]),
      dimOthers: true,
      badge: (id) => (id === first.id ? 'Target' : null),
    });
    const card = (id: string) =>
      html.split('<button').find((chunk) => chunk.includes(`data-object-id="${id}"`)) ?? '';
    expect(card(first.id)).toContain('is-clickable');
    expect(card(first.id)).toContain('Target');
    expect(card(second.id)).toContain('is-selected');
    expect(card(third.id)).toContain('is-dimmed');
    const seat = (n: number) =>
      html.split('<button').find((chunk) => chunk.includes(`data-seat="${n}"`)) ?? '';
    expect(seat(1)).toContain('is-clickable');
    expect(seat(0)).toContain('is-dimmed');
  });

  test('without a game it says so instead of crashing', () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    const html = render(store, <Board />);
    expect(html).toContain('No game in progress');
  });
});

describe('PreviewPanel', () => {
  test('empty state explains hover, pin and unpin', async () => {
    const store = await gameAfter(0);
    const html = render(store, <PreviewPanel />);
    expect(html).toContain('Hover a card to read it');
    expect(html).toContain('Right-click pins, Esc unpins');
  });

  test('a hovered card shows in full with its current state', async () => {
    const store = await gameAfter(24);
    const view = store.getState().snapshot?.view;
    const creature = view?.battlefield.find((o) => o.types.includes('creature'));
    if (creature === undefined) throw new Error('no creature on the battlefield');
    store.getState().hover(creature.id);
    const html = render(store, <PreviewPanel />);
    expect(html).toContain(creature.name.replace("'", '&#x27;'));
    expect(html).toContain(`${creature.power}/${creature.toughness}`);
    expect(html).toContain(`data-preview-id="${creature.id}"`);
    expect(html).not.toContain('Pinned');
  });

  test('a pinned card wins over the hovered one and is marked pinned', async () => {
    const store = await gameAfter(24);
    const view = store.getState().snapshot?.view;
    const [a, b] = view?.battlefield ?? [];
    if (a === undefined || b === undefined) throw new Error('need two permanents');
    store.getState().hover(b.id);
    store.getState().pin(a.id);
    const html = render(store, <PreviewPanel />);
    expect(html).toContain(`data-preview-id="${a.id}"`);
    expect(html).toContain('Pinned');
    store.getState().pin(null);
    store.getState().hover(null);
  });

  test('an object that is no longer visible says so', async () => {
    const store = await gameAfter(0);
    store.getState().hover('o999999');
    const html = render(store, <PreviewPanel />);
    expect(html).toContain('Not visible any more');
  });
});

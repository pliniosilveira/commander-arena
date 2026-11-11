/**
 * Issue 84 (D-243): the monarch, the Ring and the emblems are small cards of a strip of their own at
 * the left of each player's battlefield. These render the board over a started game whose view is
 * given a monarch, a Ring and emblems, and read the markup: no strip without any of them, a strip for
 * the monarch, one for two emblems, the opponent's labelled as the opponent's, and the preview of a card
 * of the strip.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { MONARCH_ID, MONARCH_TEXT, ringId, ringText } from '../src/game/designations';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { Board } from '../src/ui/board/Board';
import { emblemCards } from '../src/ui/board/emblems';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { StoreProvider } from '../src/ui/store-context';

type Store = ReturnType<typeof createAppStore>;

async function started(): Promise<Store> {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store
    .getState()
    .startGame({ seed: 11, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
  return store;
}

function emblem(id: ObjectView['id'], seat: number, text: string): ObjectView {
  return {
    id,
    owner: seat,
    controller: seat,
    zone: 'command',
    name: 'Emblem',
    manaCost: null,
    supertypes: [],
    types: [],
    subtypes: [],
    colors: [],
    power: null,
    toughness: null,
    oracleText: text,
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    emblem: true,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
  };
}

interface Extras {
  readonly monarch?: number | null;
  readonly emblems?: Readonly<Record<number, readonly string[]>>;
  readonly ring?: Readonly<Record<number, number>>;
}

/** The started game's view with a monarch, emblems in the command zones and a Ring tempting a seat. */
function give(store: Store, extras: Extras): void {
  const snap = store.getState().snapshot;
  if (snap === null) throw new Error('no snapshot');
  const view: GameView = {
    ...snap.view,
    monarch: extras.monarch ?? null,
    seats: snap.view.seats.map((s) => ({
      ...s,
      command: [
        ...s.command,
        ...(extras.emblems?.[s.id] ?? []).map((text, i) =>
          emblem(`o${900 + s.id * 10 + i}`, s.id, text),
        ),
      ],
      ...(extras.ring?.[s.id] === undefined ? {} : { ringTempted: extras.ring[s.id] }),
    })),
  };
  store.setState({ snapshot: { ...snap, view } });
}

const render = (store: Store, node: ReactNode) =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('the emblem strip', () => {
  test('without a monarch, a Ring or an emblem, no strip is drawn', async () => {
    const store = await started();
    give(store, {});
    const html = render(store, <Board />);
    expect(html).not.toContain('board-emblems');
    expect(html).not.toContain('data-emblem-kind');
    // The rows are still all there.
    expect(count(html, 'board-field-rows')).toBe(2);
  });

  test('the monarch is a small card in the strip of its player, with the text of CR 725.2', async () => {
    const store = await started();
    give(store, { monarch: 0 });
    const html = render(store, <Board />);
    expect(count(html, 'data-emblem-kind="monarch"')).toBe(1);
    expect(html).toContain('data-emblems-seat="0"');
    expect(html).not.toContain('data-emblems-seat="1"');
    expect(html).toContain('aria-label="Your emblems and designations"');
    expect(html).toContain('The Monarch');
    expect(html).toContain(
      'At the beginning of the monarch&#x27;s end step, that player draws a card.',
    );
    // The card is no permanent: it is no tile, cannot be dragged and is no target.
    expect(html).not.toMatch(/data-emblem-kind="monarch"[^>]*draggable/);
    expect(html).not.toContain('board-tile board-emblem');
  });

  test('two emblems are two cards, with their own words, and leave the command zone strip', async () => {
    const store = await started();
    give(store, {
      emblems: {
        0: ['Creatures you control get +1/+1.', "Spells you control can't be countered."],
      },
    });
    const html = render(store, <Board />);
    expect(count(html, 'data-emblem-kind="emblem"')).toBe(2);
    expect(html).toContain('Creatures you control get +1/+1.');
    expect(html).toContain('can&#x27;t be countered.');
    // They are shown once: in the strip, not also as a chip of the command zone, which keeps the two commanders.
    expect(count(html, 'class="board-cmdr"')).toBe(2);
  });

  test("the opponent's cards are in the opponent's strip and say whose they are", async () => {
    const store = await started();
    give(store, {
      monarch: 1,
      emblems: { 1: ['Creatures you control get +1/+1.'] },
      ring: { 1: 2 },
    });
    const html = render(store, <Board />);
    expect(html).toContain('data-emblems-seat="1"');
    expect(html).not.toContain('data-emblems-seat="0"');
    expect(html).toContain('aria-label="Opponent&#x27;s emblems and designations"');
    expect(html).toContain('Opponent&#x27;s</span>');
    expect(count(html, 'data-emblem-owner="1"')).toBe(3);
    expect(html).toContain('The Monarch (opponent&#x27;s): ');
    expect(html).toContain('The Ring (opponent&#x27;s): ');
    expect(html).toContain('is-theirs');
    expect(html).not.toContain('board-emblem is-mine');
  });

  test('both players have a strip, each beside its own battlefield', async () => {
    const store = await started();
    give(store, { monarch: 0, emblems: { 1: ['Creatures you control get +1/+1.'] } });
    const html = render(store, <Board />);
    const mine = html.indexOf('data-field-seat="0"');
    const theirs = html.indexOf('data-field-seat="1"');
    expect(mine).toBeGreaterThan(-1);
    expect(theirs).toBeGreaterThan(-1);
    const stripMine = html.indexOf('data-emblems-seat="0"');
    const stripTheirs = html.indexOf('data-emblems-seat="1"');
    // Each strip sits inside its own field's markup (the fields are one after the other).
    const [first, second] = mine < theirs ? [mine, theirs] : [theirs, mine];
    const inFirst = mine < theirs ? stripMine : stripTheirs;
    const inSecond = mine < theirs ? stripTheirs : stripMine;
    expect(inFirst).toBeGreaterThan(first);
    expect(inFirst).toBeLessThan(second);
    expect(inSecond).toBeGreaterThan(second);
  });
});

describe('the cards of the strip as data', () => {
  test('the order is the monarch, the Ring, then the emblems of the command zone', async () => {
    const store = await started();
    give(store, { monarch: 0, ring: { 0: 3 }, emblems: { 0: ['A.', 'B.'] } });
    const view = store.getState().snapshot?.view;
    if (view === undefined) throw new Error('no view');
    expect(emblemCards(view, 0).map((c) => c.kind)).toEqual([
      'monarch',
      'ring',
      'emblem',
      'emblem',
    ]);
    expect(emblemCards(view, 1)).toEqual([]);
  });

  test('the Ring shows the abilities that are on at its count of temptations (CR 701.54c)', () => {
    expect(ringText(1)).toHaveLength(1);
    expect(ringText(2)).toHaveLength(2);
    expect(ringText(3)).toHaveLength(3);
    expect(ringText(4)).toHaveLength(4);
    expect(ringText(9)).toHaveLength(4);
    expect(ringText(1)[0]).toContain('legendary');
  });

  test('the monarch has the two inherent abilities of CR 725.2', () => {
    expect(MONARCH_TEXT).toHaveLength(2);
    expect(MONARCH_TEXT[1]).toContain('its controller becomes the monarch');
  });
});

describe('the preview of a card of the strip', () => {
  test('the monarch shows its words and whose it is', async () => {
    const store = await started();
    give(store, { monarch: 1 });
    store.getState().pin(MONARCH_ID);
    const html = render(store, <PreviewPanel />);
    expect(html).toContain('The Monarch');
    expect(html).toContain('Designation');
    expect(html).toContain('its controller becomes the monarch');
    expect(html).toContain('The opponent is the monarch');
  });

  test('the Ring shows the abilities that are on and how many times it has tempted', async () => {
    const store = await started();
    give(store, { ring: { 0: 2 } });
    store.getState().pin(ringId(0));
    const html = render(store, <PreviewPanel />);
    expect(html).toContain('The Ring');
    expect(html).toContain('Emblem — tempted 2 times');
    expect(html).toContain('draw a card, then discard a card');
    expect(html).not.toContain('sacrifices it at end of combat');
  });

  test('an emblem of the command zone shows as an Emblem', async () => {
    const store = await started();
    give(store, { emblems: { 0: ['Creatures you control get +1/+1.'] } });
    store.getState().pin('o900');
    const html = render(store, <PreviewPanel />);
    expect(html).toContain('Emblem');
    expect(html).toContain('Creatures you control get +1/+1.');
  });
});

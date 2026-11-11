/**
 * Counted and defined power and toughness rendered from real games of the hidden SYNTHETIC deck
 * `synthetic-pt` (D-109): `*` in the hand with the derived number and the defining ability in the
 * title, the number on the battlefield tile, and the preview's "Defined" row.
 */
import type { ObjectView } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Board } from '../src/ui/board/Board';
import { CardFace } from '../src/ui/board/CardFace';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { StoreProvider } from '../src/ui/store-context';
import { inHand, onField, type PtStore, reachPtStore } from './pt-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 60_000 });

const live = (store: PtStore) => ({ ...store, getInitialState: () => store.getState() });
const render = (store: PtStore, node: ReactNode): string =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);

const LURKER = 'SYNTHETIC Land Lurker';
const TITLE = 'Defined by an ability: equal to the number of lands you control';

async function reach(accept: Parameters<typeof reachPtStore>[0]): Promise<PtStore> {
  const store = await reachPtStore(accept);
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

const view = (store: PtStore) => {
  const v = store.getState().snapshot?.view;
  if (v === undefined) throw new Error('no game');
  return v;
};

test('a card in the hand shows * and the title names the ability and the number now', async () => {
  const store = await reach((v) => inHand(v, LURKER) !== undefined);
  const card = inHand(view(store), LURKER) as ObjectView;
  const html = render(store, <CardFace object={card} variant="hand" />);
  expect(html).toContain(`>*/*<`);
  expect(html).toContain(`title="${TITLE} (now ${card.power}/${card.toughness})"`);
  expect(html).not.toContain('undefined');
});

test('a power-only star shows */3', async () => {
  const store = await reach((v) => inHand(v, 'SYNTHETIC Horde Hound') !== undefined);
  const card = inHand(view(store), 'SYNTHETIC Horde Hound') as ObjectView;
  expect(render(store, <CardFace object={card} variant="hand" />)).toContain('>*/3<');
});

test('on the battlefield the tile shows the derived number, with the ability in its title', async () => {
  const store = await reach((v) => onField(v, LURKER).length > 0);
  const lurker = onField(view(store), LURKER)[0] as ObjectView;
  const html = render(store, <Board />);
  const start = html.indexOf(`data-object-id="${lurker.id}"`);
  expect(start).toBeGreaterThan(-1);
  const tile = html.slice(start, html.indexOf('</button>', start));
  expect(tile).toContain(`>${lurker.power}/${lurker.toughness}<`);
  expect(tile).toContain(`title="${TITLE}"`);
  expect(tile).not.toContain('*/*');
});

test('the preview has a Defined row: printed * in the hand, only the ability on the battlefield', async () => {
  const hand = await reach((v) => inHand(v, LURKER) !== undefined);
  const card = inHand(view(hand), LURKER) as ObjectView;
  hand.getState().pin(card.id);
  const inHandHtml = render(hand, <PreviewPanel />);
  expect(inHandHtml).toContain('<dt>Defined</dt>');
  expect(inHandHtml).toContain('Printed *');
  expect(inHandHtml).toContain(TITLE);

  const field = await reach((v) => onField(v, LURKER).length > 0);
  const lurker = onField(view(field), LURKER)[0] as ObjectView;
  field.getState().pin(lurker.id);
  const html = render(field, <PreviewPanel />);
  expect(html).toContain('<dt>Defined</dt>');
  expect(html).not.toContain('Printed *');
  expect(html).toContain(TITLE);
});

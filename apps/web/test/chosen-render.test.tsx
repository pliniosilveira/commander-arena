/**
 * "As this enters, choose a creature type / a color" rendered (D-100): the creature type dialog
 * (search box, suggestions, full list, no cancel), the color dialog (five buttons with the symbol
 * and the name), and the choice on the tile and in the preview.
 */
import type { GameView } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Board } from '../src/ui/board/Board';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StoreProvider } from '../src/ui/store-context';
import { chooseAction } from './bot';
import { asksChoice, type ChosenStore, reachChosenStore } from './chosen-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 30_000 });

const live = (store: ChosenStore) => ({ ...store, getInitialState: () => store.getState() });
const render = (store: ChosenStore, node: ReactNode) =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);
const layer = (store: ChosenStore) =>
  render(
    store,
    <DecisionLayer>
      <div />
    </DecisionLayer>,
  );

async function must(accept: (view: GameView) => boolean): Promise<ChosenStore> {
  const store = await reachChosenStore(accept, { seeds: 120 });
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

/** Plays the scripted human on until the named permanent is on the battlefield. */
async function untilOnBattlefield(store: ChosenStore, name: string): Promise<GameView> {
  for (let i = 0; i < 80; i += 1) {
    const view = store.getState().snapshot?.view;
    if (view === undefined || view.pending === null) break;
    if (view.battlefield.some((o) => o.name === name)) return view;
    await store
      .getState()
      .act(view.pending.kind === 'priority' ? { kind: 'pass' } : chooseAction(view, view.pending));
  }
  throw new Error(`${name} never entered`);
}

test('the creature type dialog: prompt, search box, suggestions, the full list, no cancel', async () => {
  const store = await must(asksChoice('creatureType', 'SYNTHETIC Rally Banner'));
  const html = layer(store);
  expect(html).toContain('aria-label="Choose a creature type"');
  expect(html).toContain('As SYNTHETIC Rally Banner enters, choose a creature type.');
  expect(html).toContain('role="combobox"');
  expect(html).toContain('Suggested');
  expect(html).toContain('All creature types');
  expect(html).toContain('data-option="Goblin"');
  expect(html).toContain('data-option="Time Lord"');
  expect(html).not.toContain('>Cancel<');
  // The dialog replaces the action bar: nothing else asks for a click.
  expect(html).not.toContain('dec-dock');
});

test('the color dialog: five buttons with the mana symbol and the name', async () => {
  const store = await must(asksChoice('color', 'SYNTHETIC Hue Banner'));
  const html = layer(store);
  expect(html).toContain('aria-label="Choose a color"');
  expect(html).toContain('As SYNTHETIC Hue Banner enters, choose a color.');
  for (const [letter, name] of [
    ['W', 'White'],
    ['U', 'Blue'],
    ['B', 'Black'],
    ['R', 'Red'],
    ['G', 'Green'],
  ]) {
    expect(html).toMatch(
      new RegExp(
        `data-option="${letter}"[^>]*aria-label="${name}"|aria-label="${name}"[^>]*data-option="${letter}"`,
      ),
    );
    expect(html).toContain(`aria-label="${letter} mana"`);
    expect(html).toContain(`<span>${name}</span>`);
  }
  expect(html).not.toContain('>Cancel<');
});

test('a chosen type shows as a chip on the tile and as a row of the preview', async () => {
  const store = await must(asksChoice('creatureType', 'SYNTHETIC Rally Banner'));
  await store.getState().act({ kind: 'chooseOption', option: 'Goblin' });
  const view = await untilOnBattlefield(store, 'SYNTHETIC Rally Banner');
  const banner = view.battlefield.find((o) => o.name === 'SYNTHETIC Rally Banner');
  if (banner === undefined) throw new Error('no banner');
  expect(banner.chosen).toEqual({ creatureType: 'Goblin' });
  const board = render(store, <Board />);
  expect(board).toContain('title="Chosen type: Goblin"');
  expect(board).toMatch(/board-flag-chosen[^>]*>Goblin</);
  store.getState().hover(banner.id);
  const preview = render(store, <PreviewPanel />);
  expect(preview).toContain('<dt>Chosen creature type</dt>');
  expect(preview).toMatch(/<dd data-chosen="true">Goblin<\/dd>/);
  store.getState().hover(null);
});

test('a chosen color shows by name', async () => {
  const store = await must(asksChoice('color', 'SYNTHETIC Hue Banner'));
  await store.getState().act({ kind: 'chooseOption', option: 'U' });
  const view = await untilOnBattlefield(store, 'SYNTHETIC Hue Banner');
  const banner = view.battlefield.find((o) => o.name === 'SYNTHETIC Hue Banner');
  if (banner === undefined) throw new Error('no banner');
  expect(render(store, <Board />)).toContain('title="Chosen color: Blue"');
  store.getState().hover(banner.id);
  const preview = render(store, <PreviewPanel />);
  expect(preview).toContain('<dt>Chosen color</dt>');
  expect(preview).toMatch(/<dd data-chosen="true">Blue<\/dd>/);
  store.getState().hover(null);
});

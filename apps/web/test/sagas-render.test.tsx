/**
 * Sagas (CR 714) rendered from a real game of the hidden SYNTHETIC deck `synthetic-sagas`: the
 * lore badge on the tile, the card face and the preview, and the chapter label on the stack.
 */
import type { OrderTriggersDecision } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Board } from '../src/ui/board/Board';
import { CardFace } from '../src/ui/board/CardFace';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { OrderPanel } from '../src/ui/decisions/OrderPanel';
import { initialUi } from '../src/ui/decisions/ui-state';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import {
  RITE,
  riteChapterOnStack,
  type SagaStore,
  sagaOf,
  searchSagas,
  startStore,
} from './sagas-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 30_000 });

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: SagaStore) => ({ ...store, getInitialState: () => store.getState() });
const render = (store: SagaStore, node: ReactNode): string =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);

async function reach() {
  const reached = await searchSagas(startStore, (view) => riteChapterOnStack(view));
  if (reached === null) throw new Error('no seed reaches the situation');
  const { store } = reached.session as typeof reached.session & { store: SagaStore };
  const view = store.getState().snapshot?.view;
  const saga = view === undefined ? undefined : sagaOf(view);
  if (view === undefined || saga === undefined) throw new Error('no Saga');
  return { store, view, saga };
}

/** The HTML of one tile, from its `data-object-id` button to its end. */
function tileOf(html: string, id: string): string {
  const start = html.indexOf(`data-object-id="${id}"`);
  if (start < 0) throw new Error('the tile is not drawn');
  return html.slice(start, html.indexOf('</button>', start));
}

test('the Saga tile shows "Lore 1 / 3" and no separate lore counter chip', async () => {
  const { store, saga } = await reach();
  const tile = tileOf(render(store, <Board />), saga.id);
  expect(tile).toContain('board-counter board-lore');
  expect(tile).toContain('>Lore 1 / 3<');
  expect(tile).not.toContain('>lore 1<');
  expect(tile).toContain(`aria-label="${RITE}, Lore 1 / 3"`);
});

test('the card face and the preview of the Saga show the badge and the chapter lines', async () => {
  const { store, saga } = await reach();
  const face = render(store, <CardFace object={saga} variant="full" />);
  expect(face).toContain('>Lore 1 / 3<');
  expect(face).toContain('<p>I — You gain 1 life.</p>');
  expect(face).toContain('<p>II — You gain 2 life.</p>');
  expect(face).toContain('<p>III — You gain 4 life.</p>');
  store.getState().pin(saga.id);
  const preview = render(store, <PreviewPanel />);
  expect(preview).toContain('>Lore 1 / 3<');
  expect(preview).not.toContain('<dt>Counters</dt>');
});

test('a chapter ability on the stack is labelled with its chapter, in the panel and the preview', async () => {
  const { store, view } = await reach();
  const ability = view.stack.find((o) => o.name === RITE);
  if (ability === undefined) throw new Error('no chapter ability');
  const stack = render(store, <StackPanel />);
  expect(stack).toContain(`>${RITE} — chapter I<`);
  store.getState().pin(ability.id);
  const preview = render(store, <PreviewPanel />);
  expect(preview).toContain(`${RITE} — chapter I`);
});

test('the trigger-order panel names the chapter of each chapter ability', async () => {
  const { store, saga } = await reach();
  // Two chapters reached at once (CR 714.2, two counters from one effect): the player orders them.
  const trigger = (abilityIndex: number, chapter: number) => ({
    source: saga.id,
    sourceName: saga.name,
    sourceOracleText: '',
    abilityIndex,
    count: 1,
    chapter,
  });
  const decision: OrderTriggersDecision = {
    id: 'd1' as OrderTriggersDecision['id'],
    kind: 'orderTriggers',
    seat: 0,
    triggers: [trigger(1, 2), trigger(2, 3)],
  };
  const html = render(
    store,
    <OrderPanel
      decision={decision}
      index={new Map()}
      ui={initialUi(decision)}
      update={() => undefined}
    />,
  );
  expect(html).toContain(`${saga.name} — chapter II`);
  expect(html).toContain(`${saga.name} — chapter III`);
});

/**
 * `busy` and `data-settled`: what the Playwright tests wait for before every click (e2e/harness/
 * settle.ts). True while a request or the autopilot is in flight, false when the page shows the
 * view the game waits on.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from '../src/App';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { StoreProvider } from '../src/ui/store-context';

const options = { seed: 1, humanDeck: 'white-knights', aiDeck: 'swamp-forest' };

function settledAttr(store: ReturnType<typeof createAppStore>): string | undefined {
  const html = renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>
      <App />
    </StoreProvider>,
  );
  return /data-settled="(true|false)"/.exec(html)?.[1];
}

test('the page is not settled before a game, is settled when the game waits and is not while a request runs', async () => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  expect(store.getState().busy).toBe(false);
  expect(settledAttr(store)).toBe('false');

  const started = store.getState().startGame(options);
  await started;
  expect(store.getState().busy).toBe(false);
  expect(settledAttr(store)).toBe('true');

  const view = store.getState().snapshot?.view;
  if (view?.pending?.kind !== 'mulligan') throw new Error('expected the mulligan question');
  const acting = store.getState().act({ kind: 'keepHand' });
  // The flag is set synchronously by the click, before the Worker answers.
  expect(store.getState().busy).toBe(true);
  expect(settledAttr(store)).toBe('false');
  await acting;
  expect(store.getState().busy).toBe(false);
  expect(settledAttr(store)).toBe('true');
});

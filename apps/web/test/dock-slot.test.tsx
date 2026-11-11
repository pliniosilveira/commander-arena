/**
 * Where the action dock is drawn (issue 47, D-144): inside the decision layer when nothing provides
 * a slot (this file and the other render tests), nowhere until the page's slot has mounted, and in
 * the slot afterwards. Server rendering draws no portal, so the last case is the Playwright test of
 * `e2e/columns.e2e.ts`; here only the first two and the structure of the page are checked.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { DockSlotContext } from '../src/ui/decisions/dock-slot';
import { StoreProvider } from '../src/ui/store-context';
import { chooseAction } from './bot';

async function render(slot: HTMLElement | null | undefined): Promise<string> {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed: 3, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
  // Past the mulligan: the dock is the bar of a priority decision (a mulligan has its own dialog).
  for (let clicks = 0; clicks < 20; clicks += 1) {
    const view = store.getState().snapshot?.view;
    if (view?.pending === null || view?.pending === undefined || view.pending.kind === 'priority') {
      break;
    }
    await store.getState().act(chooseAction(view, view.pending));
  }
  const live: typeof store = { ...store, getInitialState: () => store.getState() };
  return renderToStaticMarkup(
    <StoreProvider store={live}>
      <DockSlotContext.Provider value={slot}>
        <DecisionLayer>
          <p>board</p>
        </DecisionLayer>
      </DockSlotContext.Provider>
    </StoreProvider>,
  );
}

test('without a provider the dock stays in the decision layer', async () => {
  const html = await render(undefined);
  expect(html).toContain('class="dec-dock"');
  expect(html).toContain('aria-label="Actions"');
});

test('with a provider whose slot has not mounted yet the layer draws no dock', async () => {
  const html = await render(null);
  expect(html).not.toContain('dec-dock');
  expect(html).toContain('decision-layer');
  expect(html).toContain('board');
});

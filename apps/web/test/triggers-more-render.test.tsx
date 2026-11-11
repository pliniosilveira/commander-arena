/**
 * The stack panel and the "unless that player pays" dialog, rendered from real games of the hidden
 * SYNTHETIC deck `synthetic-triggers-more` (D-108, D-111).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import {
  beginCombatOnStack,
  type MoreStore,
  searchMore,
  startMoreStore,
  unlessAsk,
} from './triggers-more-decks';

vi.setConfig({ testTimeout: 60_000 });

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: MoreStore) => ({ ...store, getInitialState: () => store.getState() });

const render = (store: MoreStore): string =>
  renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <div />
      </DecisionLayer>
      <StackPanel />
    </StoreProvider>,
  );

test('the stack says when a beginning-of-combat trigger goes off and what it does', async () => {
  const reached = await searchMore((view, d) => d.kind === 'priority' && beginCombatOnStack(view), {
    start: startMoreStore,
    seeds: 60,
  });
  if (reached === null) throw new Error('no seed reaches the situation');
  const html = render(reached.session.store);
  expect(html).toContain('At the beginning of combat on your turn, you gain 1 life');
  expect(html).toContain('Triggered ability');
});

test('the dialog of an "unless that player pays" question names the payer\'s choice', async () => {
  const reached = await searchMore(unlessAsk, { start: startMoreStore, seeds: 60 });
  if (reached === null) throw new Error('no seed reaches the situation');
  const html = render(reached.session.store);
  expect(html).toContain('aria-label="Unless you pay"');
  expect(html).toContain('Pay {1} or Opponent may draw a card?');
  expect(html).toContain('SYNTHETIC Tax Collector');
  // The stack shows what set the ability off.
  expect(html).toContain(
    'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}',
  );
  expect(html).not.toMatch(/undefined|\[object/);
});

/**
 * Restrictions on the board, in the preview and in the attack declaration, rendered from a real
 * game of the hidden SYNTHETIC deck `synthetic-restrictions`.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Board } from '../src/ui/board/Board';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StoreProvider } from '../src/ui/store-context';
import {
  mustAttackAsk,
  type RestrictionStore,
  searchRestrictions,
  startStore,
} from './restrictions-decks';

vi.setConfig({ testTimeout: 60_000 });

const live = (store: RestrictionStore) => ({ ...store, getInitialState: () => store.getState() });

async function attackGame(): Promise<RestrictionStore> {
  const reached = await searchRestrictions(startStore, mustAttackAsk);
  if (reached === null) throw new Error('no seed reaches the situation');
  return (reached.session as typeof reached.session & { store: RestrictionStore }).store;
}

test('the tile of a creature that must attack carries a restriction chip with its full name', async () => {
  const store = await attackGame();
  const html = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <Board />
    </StoreProvider>,
  );
  expect(html).toContain('class="board-kw board-kw-restrict" title="Attacks each combat"');
  expect(html).toContain('>Atk!<');
});

test('the preview lists the restriction under its own heading', async () => {
  const store = await attackGame();
  const berserker = store
    .getState()
    .snapshot?.view.battlefield.find((o) => o.restrictions?.includes('attacksEachCombat'));
  if (berserker === undefined) throw new Error('no Berserker');
  store.getState().hover(berserker.id);
  const html = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <PreviewPanel />
    </StoreProvider>,
  );
  expect(html).toContain('<dt>Restrictions</dt>');
  expect(html).toContain('<dd>Attacks each combat</dd>');
  expect(html).not.toContain('<dt>Keywords</dt>');
  store.getState().hover(null);
});

test('the attack declaration shows the creature chosen, with its badge and the explanation', async () => {
  const store = await attackGame();
  const html = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <Board />
      </DecisionLayer>
    </StoreProvider>,
  );
  expect(html).toContain('Must attack');
  expect(html).toContain('SYNTHETIC Berserker must attack each combat if able.');
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Declare attackers \(\d+\)<\/button>/);
});

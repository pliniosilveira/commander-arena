/**
 * Revealed cards in the preview panel (CR 701.20): the host reads the faces of a `cardsRevealed` event
 * (`revealed-cards.ts`) and the panel shows them when nothing is hovered; a player action clears them.
 * SYNTHETIC card data.
 */

import type { GameEvent, GameState } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { GameClient } from '../src/game/protocol';
import { revealedCards } from '../src/game/revealed-cards';
import { createAppStore } from '../src/store';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { StoreProvider } from '../src/ui/store-context';

const face = {
  name: 'Synthetic Bear',
  manaCost: ['1', 'G'],
  supertypes: [],
  types: ['creature'],
  subtypes: ['Bear'],
  oracleText: 'Trample',
};

const state = {
  cards: { c1: { definition: 'd1' }, c2: { definition: 'missing' } },
  definitions: { d1: { faces: [face] } },
} as unknown as GameState;

const event = (cards: string[]): GameEvent =>
  ({ kind: 'cardsRevealed', seat: 1, cards, names: [], from: 'library' }) as unknown as GameEvent;

test('the faces of a reveal are read from the card definitions; a card with no face is skipped', () => {
  const [card, ...rest] = revealedCards(state, [event(['c1', 'c2'])]);
  expect(rest).toEqual([]);
  expect(card).toMatchObject({ name: 'Synthetic Bear', from: 'library', oracleText: 'Trample' });
});

test('with several reveals in one snapshot the latest one is kept', () => {
  expect(revealedCards(state, [event(['c1']), event(['c2'])]).map((c) => c.name)).toEqual([
    'Synthetic Bear',
  ]);
  expect(revealedCards(state, [])).toEqual([]);
});

test('dismissing the preview empties a reveal and leaves the rest of the preview state alone', () => {
  const store = createAppStore({ client: {} as GameClient });
  const revealed = revealedCards(state, [event(['c1'])]);
  store.setState({ preview: { hovered: 'o5', revealed } });
  expect(store.getState().preview.revealed).toHaveLength(1);
  store.getState().dismissReveal();
  expect(store.getState().preview.revealed).toEqual([]);
  expect(store.getState().preview.hovered).toBe('o5');
});

test('the preview shows the revealed card, and a tap clears it', () => {
  const store = createAppStore({ client: {} as GameClient });
  const revealed = revealedCards(state, [event(['c1'])]);
  store.setState({ preview: { hovered: null, revealed } });
  const html = () =>
    renderToStaticMarkup(
      <StoreProvider store={{ ...store, getInitialState: store.getState }}>
        <PreviewPanel />
      </StoreProvider>,
    );
  expect(html()).toContain('data-preview-revealed');
  expect(html()).toContain('Synthetic Bear');
  store.setState({ preview: { hovered: null, revealed: [] } });
  expect(html()).not.toContain('data-preview-revealed');
});

/**
 * The Zone Picker (docs/BOARD_COMPONENTS.md) as rendered markup: with a question pending it carries
 * the card that asks, the prompt, the count and the buttons; without one it is a plain list.
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { ZoneViewer } from '../src/ui/board/ZoneViewer';
import type { BarModel } from '../src/ui/decisions/model';
import { barWhileClosed, ZoneDecisionProvider } from '../src/ui/decisions/zone-decision';
import { StoreProvider } from '../src/ui/store-context';
import { OPPONENT } from './alt-costs-decks';

vi.setConfig({ testTimeout: 120_000 });

type Store = ReturnType<typeof createAppStore>;

const render = (store: Store, node: ReactNode): string =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );

const bar: BarModel = {
  prompt: 'Choose a target for the ability.',
  detail: '0 of 1 chosen',
  buttons: [
    {
      key: 'confirm',
      label: 'Confirm',
      variant: 'primary',
      disabled: true,
      hint: null,
      run: () => {},
    },
  ],
  cancel: null,
  inOverlay: false,
};

describe('Zone Picker', () => {
  test('carries the question beside the list, and none without one', async () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed: 1, humanDeck: OPPONENT, aiDeck: OPPONENT });
    const view = store.getState().snapshot?.view;
    const asker = view?.seats[view.viewer]?.hand?.[0];
    if (view === undefined || asker === undefined) throw new Error('no hand');
    const list = <ZoneViewer title="You graveyard" objects={[asker]} onClose={() => undefined} />;

    const plain = render(store, list);
    expect(plain).not.toContain('data-zone-question');

    const asking = render(
      store,
      <ZoneDecisionProvider value={{ bar, source: asker.id }}>{list}</ZoneDecisionProvider>,
    );
    expect(asking).toContain('data-zone-question');
    expect(asking).toContain(`data-zone-source="${asker.id}"`);
    expect(asking).toContain('Choose a target for the ability.');
    expect(asking).toContain('0 of 1 chosen');
    expect(asking).toContain('Confirm');
  });
});

describe('Zone Picker grouping (issue 570)', () => {
  test('shows identical cards once with a count, except while a question is pending', async () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed: 1, humanDeck: OPPONENT, aiDeck: OPPONENT });
    const view = store.getState().snapshot?.view;
    const card = view?.seats[view.viewer]?.hand?.[0];
    if (view === undefined || card === undefined) throw new Error('no hand');
    const copies = [card, { ...card, id: card.id + 1000 }, { ...card, id: card.id + 2000 }];
    const list = <ZoneViewer title="Exile" objects={copies} onClose={() => undefined} />;

    const plain = render(store, list);
    expect(plain.match(/data-object-id=/g)?.length).toBe(1);
    expect(plain).toContain('data-zone-count="3"');

    const asking = render(
      store,
      <ZoneDecisionProvider value={{ bar, source: card.id }}>{list}</ZoneDecisionProvider>,
    );
    expect(asking).not.toContain('data-zone-count');
    expect(asking.match(/data-object-id=/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Zone Picker gate', () => {
  test('a closed picker holds every button back and offers to open it again', () => {
    let opened = 0;
    const held = barWhileClosed(bar, 'graveyard', () => {
      opened += 1;
    });
    const confirm = held.buttons.find((b) => b.key === 'confirm');
    const open = held.buttons.find((b) => b.key === 'open-zone');
    expect(confirm?.disabled).toBe(true);
    expect(open?.disabled).toBe(false);
    open?.run();
    expect(opened).toBe(1);
  });
});

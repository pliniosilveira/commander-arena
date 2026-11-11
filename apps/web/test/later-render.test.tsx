/**
 * The cast-later family (D-128) as rendered markup: a face-down foretold card of the other player is a
 * card back that names nothing, the viewer's own foretold card and a suspended card carry their marks, in
 * the strip above the hand and in the exile viewer.
 */
import type { GameView } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { Board } from '../src/ui/board/Board';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { ZoneViewer } from '../src/ui/board/ZoneViewer';
import { StoreProvider } from '../src/ui/store-context';
import { landBot, OPPONENT, priority } from './alt-costs-decks';
import { storeSession } from './ward-decks';

vi.setConfig({ testTimeout: 120_000 });

type Store = ReturnType<typeof createAppStore>;

function render(store: Store, node: ReactNode): string {
  return renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );
}

/** Plays lands and passes with a store until `accept` holds (or the seeds run out). */
async function reach(
  humanDeck: string,
  aiDeck: string,
  accept: (view: GameView) => boolean,
): Promise<Store> {
  for (let seed = 1; seed <= 40; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store.getState().startGame({ seed, humanDeck, aiDeck });
    const session = storeSession(store);
    for (let clicks = 0; clicks < 800; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (accept(view)) return store;
      if ((await session.act(landBot(view))) === null) break;
    }
  }
  throw new Error('no seed reaches the situation');
}

describe('a face-down foretold card of the opponent', () => {
  const GIANT = 'SYNTHETIC Foretell Giant';

  test('is a card back in the strip and the exile viewer, named nowhere', async () => {
    const store = await reach(OPPONENT, 'synthetic-foretell', (v) =>
      v.exile.some((o) => o.faceDown === true),
    );
    const view = store.getState().snapshot?.view;
    if (view === undefined) throw new Error('no view');
    const html = render(store, <Board />);
    expect(html).toContain('Face-down card');
    expect(html).toContain('Suspended and foretold cards in exile');
    expect(html).not.toContain(GIANT);

    const viewer = render(
      store,
      <ZoneViewer title="Exile (shared)" objects={[...view.exile]} onClose={() => undefined} />,
    );
    expect(viewer).toContain('Face-down card (face down)');
    expect(viewer).toContain('data-face-down');
    expect(viewer).toContain('Opponent&#x27;s');
    expect(viewer).not.toContain(GIANT);

    // Pinned in the preview: the placeholder explains itself and still names no card.
    const down = view.exile.find((o) => o.faceDown === true);
    if (down === undefined) throw new Error('no face-down card');
    store.getState().pin(down.id);
    const preview = render(store, <PreviewPanel />);
    expect(preview).toContain('A face-down card in exile');
    expect(preview).not.toContain(GIANT);
  });
});

describe("the viewer's own foretold and suspended cards", () => {
  test('a foretold card is the full card with "Foretold" in the exile viewer', async () => {
    const store = await reach(
      'synthetic-foretell',
      OPPONENT,
      (v) => priority(v)?.options.some((o) => o.kind === 'foretell') === true,
    );
    const session = storeSession(store);
    const foretell = priority(session.snapshot().view)?.options.find((o) => o.kind === 'foretell');
    if (foretell === undefined) throw new Error('no foretell');
    await session.act(foretell);
    await session.act({ kind: 'payAuto' });
    const view = session.snapshot().view;
    expect(view.exile.some((o) => o.foretold === true)).toBe(true);
    const html = render(store, <Board />);
    expect(html).toContain('SYNTHETIC Foretell Giant');
    expect(html).toContain('Foretold');
    const viewer = render(
      store,
      <ZoneViewer title="Exile (shared)" objects={[...view.exile]} onClose={() => undefined} />,
    );
    expect(viewer).toContain('data-exile-mark="Foretold"');
    expect(viewer).toContain('Yours');
  });

  test('a suspended card shows its time counters in the strip and the viewer', async () => {
    const store = await reach(
      'synthetic-suspend',
      OPPONENT,
      (v) => priority(v)?.options.some((o) => o.kind === 'suspend') === true,
    );
    const session = storeSession(store);
    const view = session.snapshot().view;
    const suspend = priority(view)?.options.find((o) => o.kind === 'suspend');
    if (suspend === undefined) throw new Error('no suspend');
    await session.act(suspend);
    await session.act({ kind: 'payAuto' });
    const after = session.snapshot().view;
    const html = render(store, <Board />);
    expect(html).toContain('time 3');
    expect(html).toContain('SYNTHETIC Suspend Bear');
    const viewer = render(
      store,
      <ZoneViewer title="Exile (shared)" objects={[...after.exile]} onClose={() => undefined} />,
    );
    expect(viewer).toContain('data-exile-mark="time 3"');
  });
});

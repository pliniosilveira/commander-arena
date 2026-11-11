import type { ObjectId } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { Board } from '../src/ui/board/Board';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { DragProvider } from '../src/ui/dnd/DragProvider';
import { type Interaction, InteractionProvider, NO_INTERACTION } from '../src/ui/interaction';
import { StoreProvider } from '../src/ui/store-context';
import { chooseAction } from './bot';

type Store = ReturnType<typeof createAppStore>;

async function mainPhaseGame(): Promise<Store> {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
  for (let i = 0; i < 40; i += 1) {
    const view = store.getState().snapshot?.view;
    if (view === undefined || view.pending === null) break;
    // The player's own main phase: the opponent's spell cast in theirs now waits for the player too (issue 105).
    const mine = view.activeSeat === view.viewer && view.stack.length === 0;
    if (view.pending.kind === 'priority' && view.step === 'precombatMain' && mine) break;
    await store.getState().act(chooseAction(view, view.pending));
  }
  return store;
}

function render(store: Store, node: ReactNode): string {
  const live: Store = { ...store, getInitialState: () => store.getState() };
  return renderToStaticMarkup(<StoreProvider store={live}>{node}</StoreProvider>);
}

const draggableIds = (html: string): string[] =>
  [...html.matchAll(/<button[^>]*?data-object-id="([^"]+)"[^>]*?>/g)]
    .filter((m) => m[0].includes('draggable="true"'))
    .map((m) => m[1] ?? '');

describe('draggable markup', () => {
  test('without a decision nothing is draggable, and every card says so explicitly', async () => {
    const store = await mainPhaseGame();
    const html = render(store, <Board />);
    expect(html).not.toContain('draggable="true"');
    expect(html).toContain('draggable="false"');
  });

  test('only cards that are clickable and have somewhere to go are draggable', async () => {
    const store = await mainPhaseGame();
    const view = store.getState().snapshot?.view;
    const pending = view?.pending;
    if (view === undefined || pending?.kind !== 'priority') throw new Error('no priority');
    const castable = new Set<ObjectId>(
      pending.options.flatMap((o) =>
        o.kind === 'castSpell' || o.kind === 'playLand' ? [o.object] : [],
      ),
    );
    expect(castable.size).toBeGreaterThan(0);

    const html = render(
      store,
      <DecisionLayer>
        <Board />
      </DecisionLayer>,
    );
    const ids = draggableIds(html);
    expect(new Set(ids)).toEqual(castable);
    // Every one of them is a hand card; no permanent (a land that taps for mana) is draggable.
    const hand = new Set((view.seats[view.viewer]?.hand ?? []).map((c) => c.id));
    for (const id of ids) expect(hand.has(id as ObjectId)).toBe(true);
  });

  test('the zones exist: your battlefield and both strips carry data-drop', async () => {
    const store = await mainPhaseGame();
    const html = render(store, <Board />);
    expect(html.match(/data-drop="battlefield"/g)).toHaveLength(1);
    expect(html.match(/data-drop="seat"/g)).toHaveLength(2);
  });

  test('a card outside the Interaction clickable set is not draggable even if the plan offers it', async () => {
    const store = await mainPhaseGame();
    const hand = store.getState().snapshot?.view.seats[0]?.hand ?? [];
    const [first, second] = hand;
    if (first === undefined || second === undefined) throw new Error('short hand');
    const ix: Interaction = { ...NO_INTERACTION, clickable: new Set([first.id]) };
    const plan = {
      spec: () => ({ zones: [{ target: { kind: 'battlefield' as const }, label: 'x' }] }),
      drop: () => {},
    };
    const html = render(
      store,
      <InteractionProvider value={ix}>
        <DragProvider plan={plan}>
          <Board />
        </DragProvider>
      </InteractionProvider>,
    );
    expect(draggableIds(html)).toEqual([first.id]);
  });
});

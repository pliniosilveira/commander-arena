/**
 * What the board marks as carried for the three attach and flashback gestures: the Equipment's
 * tile and its strip, the Aura in the hand, the flashback chip and the graveyard list's card. Only
 * what the decision layer offers a drop for is draggable; nothing else changes.
 */
import type { GameView, ObjectId } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Board } from '../src/ui/board/Board';
import { ZoneViewer } from '../src/ui/board/ZoneViewer';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { objectIndex } from '../src/ui/decisions/lookup';
import { initialUi } from '../src/ui/decisions/ui-state';
import { dragSpec } from '../src/ui/dnd/model';
import { StoreProvider } from '../src/ui/store-context';
import { find, mine, reachAttachmentsStore, untappedLands } from './attachments-decks';
import { flashbackCards, reachKickerStore } from './kicker-decks';

type Store = NonNullable<Awaited<ReturnType<typeof reachAttachmentsStore>>>;

function render(store: Store, node: ReactNode): string {
  const live: Store = { ...store, getInitialState: () => store.getState() };
  return renderToStaticMarkup(<StoreProvider store={live}>{node}</StoreProvider>);
}

const draggableIds = (html: string): string[] =>
  [...html.matchAll(/<button[^>]*?data-object-id="([^"]+)"[^>]*?>/g)]
    .filter((m) => m[0].includes('draggable="true"'))
    .map((m) => m[1] ?? '');

const carried = (view: GameView, id: ObjectId, source: 'card' | 'permanent') => {
  const pending = view.pending;
  return (
    pending !== null &&
    dragSpec(pending, initialUi(pending), objectIndex(view), view.viewer, id, source) !== null
  );
};

const SLOW = { timeout: 40_000 };

/** The first creature the Equipment's drag offers a zone for. */
function hostOf(view: GameView, id: ObjectId): ObjectId | undefined {
  const pending = view.pending;
  if (pending === null) return undefined;
  const zone = dragSpec(
    pending,
    initialUi(pending),
    objectIndex(view),
    view.viewer,
    id,
    'permanent',
  )?.zones[0]?.target;
  return zone?.kind === 'object' ? zone.id : undefined;
}

describe('Equipment and Auras', () => {
  test(
    'an Equipment tile and an Aura in the hand are draggable when they have a host',
    SLOW,
    async () => {
      const store = await reachAttachmentsStore(
        (v) => {
          const blade = mine(v, 'SYNTHETIC Blade').find((o) => o.attachedTo === undefined);
          const aura = find(v, 'SYNTHETIC Might Aura');
          return (
            blade !== undefined &&
            aura?.zone === 'hand' &&
            carried(v, blade.id, 'permanent') &&
            carried(v, aura.id, 'card')
          );
        },
        { seeds: 120 },
      );
      if (store === null) throw new Error('no seed reached the situation');
      const view = store.getState().snapshot?.view;
      const blade = view === undefined ? undefined : mine(view, 'SYNTHETIC Blade')[0];
      const aura = view === undefined ? undefined : find(view, 'SYNTHETIC Might Aura');
      if (blade === undefined || aura === undefined) throw new Error('setup');
      const ids = draggableIds(
        render(
          store,
          <DecisionLayer>
            <Board />
          </DecisionLayer>,
        ),
      );
      expect(ids).toContain(blade.id);
      expect(ids).toContain(aura.id);
      // No land that taps for mana is carried, and nothing is when there is no decision layer.
      for (const land of view?.battlefield.filter((o) => o.types.includes('land')) ?? []) {
        expect(ids).not.toContain(land.id);
      }
      expect(draggableIds(render(store, <Board />))).toEqual([]);
    },
  );

  test('an Equipment worn by a creature is carried by its strip', SLOW, async () => {
    const store = await reachAttachmentsStore(
      (v) => {
        const blade = mine(v, 'SYNTHETIC Blade').find((o) => o.attachedTo === undefined);
        return (
          blade !== undefined &&
          carried(v, blade.id, 'permanent') &&
          untappedLands(v) >= 2 &&
          v.battlefield.filter((o) => o.types.includes('creature') && o.controller === 0).length >=
            2
        );
      },
      { seeds: 200 },
    );
    if (store === null) throw new Error('no seed reached the situation');
    store.getState().setSettings({ fullControl: true });
    const first = store.getState().snapshot?.view;
    const blade = first === undefined ? undefined : mine(first, 'SYNTHETIC Blade')[0];
    const host = first === undefined || blade === undefined ? undefined : hostOf(first, blade.id);
    if (blade === undefined || host === undefined) throw new Error('setup');
    // Equip it the click way, let it resolve, and it is worn: a strip under the creature.
    const equip =
      first?.pending?.kind === 'priority'
        ? first.pending.options.find((o) => o.kind === 'activate' && o.object === blade.id)
        : undefined;
    if (equip?.kind !== 'activate') throw new Error('no equip option');
    await store.getState().act(equip);
    await store
      .getState()
      .act({ kind: 'chooseTargets', targets: [{ kind: 'object', id: host, specId: 't1' }] });
    for (let i = 0; i < 12 && (store.getState().snapshot?.view.stack.length ?? 0) > 0; i += 1) {
      await store.getState().act({ kind: 'pass' });
    }
    const view = store.getState().snapshot?.view;
    const worn = view === undefined ? undefined : mine(view, 'SYNTHETIC Blade')[0];
    expect(worn?.attachedTo).toBe(host);
    if (view === undefined || worn === undefined) throw new Error('setup');
    // It can be moved to the other creature, so its strip is carried.
    expect(carried(view, worn.id, 'permanent')).toBe(true);
    const html = render(
      store,
      <DecisionLayer>
        <Board />
      </DecisionLayer>,
    );
    const strip = html.match(/<button[^>]*board-attach[^>]*>/)?.[0] ?? '';
    expect(strip).toContain(`data-object-id="${worn.id}"`);
    expect(strip).toContain('draggable="true"');
  });
});

describe('flashback', () => {
  test(
    'the chip above the hand and the card in the graveyard list are draggable',
    SLOW,
    async () => {
      const store = await reachKickerStore(
        (v) => flashbackCards(v).some((c) => carried(v, c.id, 'card')),
        { seeds: 120 },
      );
      if (store === null) throw new Error('no seed reached the situation');
      const view = store.getState().snapshot?.view;
      const card = view === undefined ? undefined : flashbackCards(view)[0];
      if (view === undefined || card === undefined) throw new Error('setup');
      const grave = view.seats[view.viewer]?.graveyard ?? [];

      const html = render(
        store,
        <DecisionLayer>
          <Board />
          <ZoneViewer title="Your graveyard" objects={grave} onClose={() => {}} />
        </DecisionLayer>,
      );
      const chip = html.match(/<button[^>]*board-flashback-chip[^>]*>/)?.[0] ?? '';
      expect(chip).toContain('draggable="true"');
      expect(chip).toContain(`data-object-id="${card.id}"`);
      const listed =
        html.match(/<button[^>]*board-zone-card[^>]*data-object-id="[^"]+"[^>]*>/g) ?? [];
      expect(listed.length).toBe(grave.length);
      // Only the flashback cards are draggable in the list; the other cards of the graveyard are not.
      const offered = new Set(flashbackCards(view).map((c) => c.id));
      for (const g of grave) {
        const tag = listed.find((t) => t.includes(`data-object-id="${g.id}"`)) ?? '';
        expect(tag.includes('draggable="true"')).toBe(
          offered.has(g.id) && carried(view, g.id, 'card'),
        );
      }
    },
  );
});

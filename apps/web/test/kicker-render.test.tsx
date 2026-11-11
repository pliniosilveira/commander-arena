/**
 * Kicker and Flashback rendered: the kicker dialog and bar, the "kicked" and "flashback" badges on
 * the stack, the card and the preview, and the graveyard cards that can be cast with flashback.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CardFace } from '../src/ui/board/CardFace';
import { OtherZonesStrip } from '../src/ui/board/OtherZonesStrip';
import { ZoneViewer } from '../src/ui/board/ZoneViewer';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import { flashbackCards, type KickerStore, reachKickerStore } from './kicker-decks';

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: KickerStore) => ({ ...store, getInitialState: () => store.getState() });

const asks = (name: string) => (view: GameView) =>
  view.pending?.kind === 'confirmOptional' &&
  view.pending.purpose === 'kicker' &&
  view.pending.sourceName === name;

async function must(accept: (view: GameView) => boolean): Promise<KickerStore> {
  const store = await reachKickerStore(accept);
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

test("the kicker question: a dialog with the prompt, Kick, Don't kick and Cancel", async () => {
  const store = await must(asks('SYNTHETIC Kicker Bear'));
  const html = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <div />
      </DecisionLayer>
    </StoreProvider>,
  );
  expect(html).toContain('aria-label="Kicker"');
  expect(html).toContain('SYNTHETIC Kicker Bear');
  expect(html).toContain('Pay the kicker cost {2}?');
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Kick<\/button>/);
  expect(html).toContain('>Don&#x27;t kick<');
  expect(html).toContain('>Cancel<');
  // The shock-land wording is not used for this question.
  expect(html).not.toContain('enters tapped');
  expect(html).not.toContain('Optional ability');
});

test('the life kicker question names the life', async () => {
  const store = await must(asks('SYNTHETIC Life Kicker'));
  const html = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <div />
      </DecisionLayer>
    </StoreProvider>,
  );
  expect(html).toContain('Pay the kicker cost: 3 life?');
});

test('a kicked spell on the stack carries the badge', async () => {
  const store = await must(asks('SYNTHETIC Kicker Bear'));
  // Full Control keeps the spell on the stack with the player holding priority.
  store.getState().setSettings({ fullControl: true });
  await store.getState().act({ kind: 'acceptOptional' });
  expect(store.getState().error).toBeNull();
  const view = store.getState().snapshot?.view;
  if (view?.pending?.kind === 'payMana') await store.getState().act({ kind: 'payAuto' });
  expect(store.getState().snapshot?.view.stack.some((o) => o.kicked === true)).toBe(true);
  const html = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <StackPanel />
    </StoreProvider>,
  );
  expect(html).toContain('SYNTHETIC Kicker Bear');
  expect(html).toContain('>kicked<');
  expect(html).not.toContain('>flashback<');
});

const spell = (patch: Partial<ObjectView>): ObjectView =>
  ({
    id: 'o1',
    owner: 0,
    controller: 0,
    zone: 'stack',
    name: 'Bolt',
    manaCost: ['R'],
    supertypes: [],
    types: ['instant'],
    subtypes: [],
    colors: ['R'],
    power: null,
    toughness: null,
    oracleText: '',
    counters: {},
    keywords: [],
    isCommander: false,
    isToken: false,
    support: 'supported',
    ...patch,
  }) as ObjectView;

test('the card face shows "kicked" and "flashback" only when the view says so', async () => {
  const store = await must(asks('SYNTHETIC Kicker Bear'));
  const face = (o: ObjectView) =>
    renderToStaticMarkup(
      <StoreProvider store={live(store)}>
        <CardFace object={o} variant="hand" />
      </StoreProvider>,
    );
  expect(face(spell({ kicked: true }))).toContain('>kicked<');
  expect(face(spell({ flashback: true }))).toContain('>flashback<');
  const both = face(spell({ kicked: true, flashback: true }));
  expect(both).toContain('>kicked<');
  expect(both).toContain('>flashback<');
  const plain = face(spell({}));
  expect(plain).not.toContain('kicked');
  expect(plain).not.toContain('flashback');
});

test('graveyard cards that can be cast with flashback are listed above the hand and badged in the list', async () => {
  const store = await must((view) => flashbackCards(view).length > 0);
  const view = store.getState().snapshot?.view;
  if (view === undefined) throw new Error('no view');
  const [card] = flashbackCards(view);
  if (card === undefined) throw new Error('no card');
  const strip = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <OtherZonesStrip view={view} />
      </DecisionLayer>
    </StoreProvider>,
  );
  expect(strip).toContain('aria-label="Cast from your graveyard"');
  expect(strip).toContain(card.name);
  expect(strip).toMatch(/Flashback (\{[^}]+\})+/);

  const list = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <ZoneViewer
          title="Your graveyard"
          objects={view.seats[view.viewer]?.graveyard ?? []}
          onClose={() => {}}
        />
      </DecisionLayer>
    </StoreProvider>,
  );
  expect(list).toMatch(/class="board-ibadge">Flashback (\{[^}]+\})+</);
  expect(list).toContain('is-clickable');
});

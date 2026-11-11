/**
 * Stack legibility (issues 82, 105, 107): the preview panel shows the top of the stack when nothing is
 * pinned or hovered, a new object on the stack takes the preview from a hover, and the announced X is
 * written into the text of a spell or ability on the stack. Static markup (no DOM in these tests); the
 * real page is covered by `e2e/stack-legibility.e2e.ts` and `e2e/x.e2e.ts`.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { objectId } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { previewChoice } from '../src/ui/board/resolve';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import { asksX, reachXStore, type XStore } from './x-decks';

const live = (store: XStore) => ({ ...store, getInitialState: () => store.getState() });
const renderWith = (store: XStore, node: React.ReactNode) =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);

async function must(accept: (view: GameView) => boolean): Promise<XStore> {
  const store = await reachXStore(accept);
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

/** Casts the X Burn the question asks about at the opponent's face, with Full Control so it stays on the stack. */
async function burnOnTheStack(x: number): Promise<XStore> {
  const store = await must(asksX('SYNTHETIC X Burn', x));
  store.getState().setSettings({ fullControl: true });
  await store.getState().act({ kind: 'chooseX', value: x });
  let view = store.getState().snapshot?.view;
  if (view?.pending?.kind === 'targets') {
    const face = view.pending.specs
      .flatMap((s) => s.legal)
      .find((t) => t.kind === 'player' && t.seat === 1);
    if (face === undefined) throw new Error('no face target');
    await store.getState().act({ kind: 'chooseTargets', targets: [face] });
    view = store.getState().snapshot?.view;
  }
  if (view?.pending?.kind === 'payMana') await store.getState().act({ kind: 'payAuto' });
  expect(store.getState().error).toBeNull();
  return store;
}

const bare = (n: number): ObjectView =>
  ({ id: objectId(n), zone: 'battlefield', name: `card ${n}` }) as unknown as ObjectView;

test('previewChoice: pinned, then hovered while visible, then the top of the stack', () => {
  const stack = [
    { ...bare(1), zone: 'stack' },
    { ...bare(2), zone: 'stack' },
  ] as ObjectView[];
  const view = {
    battlefield: [bare(5)],
    stack,
    exile: [],
    seats: [{ graveyard: [], command: [], hand: [] }],
    viewer: 0,
  } as unknown as GameView;
  expect(previewChoice(view, objectId(5), objectId(1))).toEqual({
    id: objectId(5),
    source: 'pinned',
  });
  expect(previewChoice(view, null, objectId(5))).toEqual({ id: objectId(5), source: 'hovered' });
  // The stack lists bottom first: its last item is the top.
  expect(previewChoice(view, null, null)).toEqual({ id: objectId(2), source: 'stack' });
  // A hovered object that is gone does not hide the stack.
  expect(previewChoice(view, null, objectId(99))).toEqual({ id: objectId(2), source: 'stack' });
  // With nothing on the stack: nothing, or the old "not visible" for a gone hover.
  const empty = { ...view, stack: [] } as unknown as GameView;
  expect(previewChoice(empty, null, null)).toEqual({ id: null, source: 'none' });
  expect(previewChoice(empty, null, objectId(99))).toEqual({ id: objectId(99), source: 'hovered' });
  // The monarch's ability has no source and no card: nothing is shown for it.
  const monarch = {
    ...bare(3),
    zone: 'stack',
    ability: { kind: 'triggered' },
  } as unknown as ObjectView;
  const inherent = { ...view, stack: [monarch] } as unknown as GameView;
  expect(previewChoice(inherent, null, null)).toEqual({ id: null, source: 'none' });
});

test('with nothing hovered the preview shows the spell on the stack, with its X written in the text (issues 82, 107)', async () => {
  const store = await burnOnTheStack(3);
  const view = store.getState().snapshot?.view as GameView;
  const spell = view.stack.find((o) => o.name === 'SYNTHETIC X Burn');
  expect(spell?.x).toBe(3);
  const html = renderWith(store, <PreviewPanel />);
  expect(html).toContain(`data-preview-id="${spell?.id}"`);
  expect(html).toContain('data-preview-stack');
  expect(html).toContain('Top of the stack');
  expect(html).toContain('Deals X (3) damage to any target.');
  // A pinned card wins and the flag goes.
  const other = view.battlefield[0] ?? view.seats[0]?.hand?.[0];
  if (other === undefined) throw new Error('no other card');
  store.getState().pin(other.id);
  const pinned = renderWith(store, <PreviewPanel />);
  expect(pinned).toContain(`data-preview-id="${other.id}"`);
  expect(pinned).not.toContain('data-preview-stack');
  store.getState().pin(null);
});

test('a new object on top of the stack takes the preview from a hover', async () => {
  const store = await must(asksX('SYNTHETIC X Burn', 2));
  store.getState().setSettings({ fullControl: true });
  // Take the cast back: the card is in the hand again and the player holds priority.
  await store.getState().undo();
  const view = store.getState().snapshot?.view as GameView;
  const cast = view.pending?.kind === 'priority' ? view.pending.options : [];
  const burn = view.seats[0]?.hand?.find((c) => c.name === 'SYNTHETIC X Burn');
  const option = cast.find((o) => o.kind === 'castSpell' && o.object === burn?.id);
  if (burn === undefined || option === undefined) throw new Error('the cast is not on offer');
  expect(view.stack).toHaveLength(0);
  // The pointer rests on the card as it is clicked, so it is the hovered one.
  store.getState().hover(burn.id);
  await store.getState().act(option);
  expect(store.getState().snapshot?.view.stack.length).toBeGreaterThan(0);
  expect(store.getState().preview.hovered).toBeNull();
  // A pinned card stays pinned when the stack changes.
  store.getState().pin(burn.id);
  expect(store.getState().preview.pinned).toBe(burn.id);
  store.getState().pin(null);
});

test('an ability with an announced X says its value in its words and in its badge (issue 107)', async () => {
  const store = await must(asksX('SYNTHETIC Double Well', 1));
  store.getState().setSettings({ fullControl: true });
  await store.getState().act({ kind: 'chooseX', value: 1 });
  if (store.getState().snapshot?.view.pending?.kind === 'payMana')
    await store.getState().act({ kind: 'payAuto' });
  const view = store.getState().snapshot?.view as GameView;
  const ability = view.stack.find((o) => o.name === 'SYNTHETIC Double Well');
  expect(ability?.x).toBe(1);
  const html = renderWith(store, <StackPanel />);
  expect(html).toContain('X = 1');
  expect(html).toContain('You draw X (1) cards');
  // The preview of the ability shows the card's text with the same value for its X.
  const preview = renderWith(store, <PreviewPanel />);
  expect(preview).toContain('{X}{X}, {T}: Draw X (1) cards.');
});

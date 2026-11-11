/**
 * X in costs rendered (D-103): the "Choose X" dialog and its prompt, X = 3 on the stack and in the
 * preview, and a card with an {X} in its cost in the hand. Static markup only (no DOM in these tests);
 * the keyboard is covered by `x-picker.test.ts` and `e2e/x.e2e.ts`.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CardFace } from '../src/ui/board/CardFace';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { costText } from '../src/ui/decisions/cast-cost';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import { asksX, chooseXOf, reachXStore, type XStore } from './x-decks';

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: XStore) => ({ ...store, getInitialState: () => store.getState() });
const renderWith = (store: XStore, node: React.ReactNode) =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);

async function must(accept: (view: GameView) => boolean): Promise<XStore> {
  const store = await reachXStore(accept);
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

test('the dialog names the card, what X costs and the maximum; it has steppers, Max, Confirm and Cancel', async () => {
  const store = await must(asksX('SYNTHETIC X Burn', 2));
  const d = chooseXOf(store.getState().snapshot?.view as GameView);
  if (d === null) throw new Error('wrong decision');
  const html = renderWith(
    store,
    <DecisionLayer>
      <div />
    </DecisionLayer>,
  );
  expect(html).toContain('aria-label="Choose X"');
  expect(html).toContain('SYNTHETIC X Burn');
  expect(html).toContain('Deals X damage to any target.');
  expect(html).toContain(
    `Choose X for SYNTHETIC X Burn. Each X costs {1}; you can afford up to X = ${d.max}.`,
  );
  expect(html).toContain('aria-label="Less X"');
  expect(html).toContain('aria-label="More X"');
  expect(html).toMatch(/<input[^>]*aria-label="X"[^>]*value="1"/);
  expect(html).toContain('>Max<');
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Choose X = 1<\/button>/);
  expect(html).toContain('>Cancel<');
  expect(html).toContain('X = 1 pays {1} of the cost.');
});

test('"pay X life" and an ability say so in the prompt', async () => {
  const blood = await must(asksX('SYNTHETIC Blood Burn', 2));
  expect(
    renderWith(
      blood,
      <DecisionLayer>
        <div />
      </DecisionLayer>,
    ),
  ).toContain('Each X costs 1 life; you can afford up to X = ');
  const well = await must(asksX('SYNTHETIC Double Well', 1, 'ability'));
  const html = renderWith(
    well,
    <DecisionLayer>
      <div />
    </DecisionLayer>,
  );
  expect(html).toContain(
    'Choose X for SYNTHETIC Double Well&#x27;s ability. Each X costs {2}; you can',
  );
});

test('a card with {X} in its cost shows the printed cost with X and says X is chosen as it is cast', async () => {
  const store = await must(asksX('SYNTHETIC X Burn', 1));
  // Another card with an {X} still in the hand (the one being cast is on the stack).
  const hand = store.getState().snapshot?.view.seats[0]?.hand ?? [];
  const xCard = hand.find((o) => o.castCost?.includes('X') === true);
  const burn: ObjectView = xCard ?? {
    ...(hand[0] as ObjectView),
    name: 'SYNTHETIC X Burn',
    manaCost: ['X', 'R'],
    castCost: ['X', 'R'],
  };
  const html = renderWith(store, <CardFace object={burn} variant="hand" />);
  expect(html).toContain('aria-label="X mana"');
  expect(html).toContain('data-cost-x');
  expect(html).toContain(`Costs ${costText(burn.castCost ?? [])}. You choose X as you cast it`);
});

test('on the stack the spell shows "X = 3" and the mana cost paid; the preview says it too', async () => {
  const store = await must(asksX('SYNTHETIC X Burn', 3));
  // Full Control keeps the spell on the stack with the player holding priority.
  store.getState().setSettings({ fullControl: true });
  await store.getState().act({ kind: 'chooseX', value: 3 });
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
  const spell = store.getState().snapshot?.view.stack.find((o) => o.name === 'SYNTHETIC X Burn');
  expect(spell?.x).toBe(3);
  const stack = renderWith(store, <StackPanel />);
  expect(stack).toContain('SYNTHETIC X Burn');
  expect(stack).toContain('X = 3');
  expect(stack).toContain('data-x="3"');
  // The cost shown is the one paid: {3}{R}, not {X}{R}.
  expect(stack).toContain('aria-label="3 mana"');
  expect(stack).not.toContain('aria-label="X mana"');
  store.getState().hover(spell?.id ?? null);
  const preview = renderWith(store, <PreviewPanel />);
  expect(preview).toContain('<dt>X</dt>');
  expect(preview).toContain('3 (mana cost paid: {3}{R})');
  store.getState().hover(null);
});

test('a spell without an X has no X badge', async () => {
  const store = await must(asksX('SYNTHETIC X Burn', 1));
  const plain = {
    id: 'o9',
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
  } as unknown as ObjectView;
  expect(renderWith(store, <CardFace object={plain} variant="hand" />)).not.toContain('X = ');
});

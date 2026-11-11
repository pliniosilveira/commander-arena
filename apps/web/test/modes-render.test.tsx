/**
 * Modal spells rendered (D-114): the mode chooser (radio buttons for "choose one", check boxes
 * otherwise, an illegal mode disabled with its reason, Cancel for a spell and none for a trigger),
 * the targets grouped under their mode, "Chosen: ..." on the stack and in the preview, and the
 * trigger-ordering panel's wording. Static markup only; the click and key paths are in
 * `e2e/modal.e2e.ts`.
 */
import type { GameView, ObjectView, OrderTriggersDecision, Trigger } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { OrderPanel } from '../src/ui/decisions/OrderPanel';
import { initialUi } from '../src/ui/decisions/ui-state';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import { asksModes, type ModalStore, modesOf, reachModalStore, someCreature } from './modal-decks';

// The seed search plays whole games: give each test room.
vi.setConfig({ testTimeout: 90_000 });

const live = (store: ModalStore) => ({ ...store, getInitialState: () => store.getState() });
const renderWith = (store: ModalStore, node: React.ReactNode) =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);

async function must(accept: (view: GameView) => boolean): Promise<ModalStore> {
  const store = await reachModalStore(accept);
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

const layer = (
  <DecisionLayer>
    <div />
  </DecisionLayer>
);

const THREE = 'SYNTHETIC Three Way Charm';
const illegalMode = (v: GameView) =>
  asksModes(THREE)(v) && (modesOf(v)?.modes.some((m) => !m.legal) ?? false);

test('"choose one" is a group of radio buttons; an illegal mode is disabled and says why', async () => {
  const store = await must(illegalMode);
  const html = renderWith(store, layer);
  expect(html).toContain('aria-label="Choose modes"');
  expect(html).toContain(THREE);
  expect(html).toContain('Choose one —');
  expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
  expect(html).not.toContain('type="checkbox"');
  // Mode 1 has no creature to aim at.
  expect(html).toMatch(/data-mode="0"[^>]*data-legal="false"/);
  expect(html).toMatch(
    /<input[^>]*disabled=""[^>]*type="radio"|<input[^>]*type="radio"[^>]*disabled=""/,
  );
  expect(html).toContain('No legal target');
  expect(html).toContain('Deals 3 damage to target creature.');
  expect(html).toContain('0 of 1 chosen');
  // Nothing is picked, so Confirm is disabled; the spell can be cancelled.
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-dec-primary[^>]*>Confirm<\/button>/);
  expect(html).toContain('>Cancel<');
  expect(html).not.toContain('checked=""');
});

test('"choose two" is a group of check boxes with its own heading', async () => {
  const store = await must((v) => asksModes('SYNTHETIC Twin Charm')(v) && someCreature(v));
  const html = renderWith(store, layer);
  expect(html).toContain('Choose two —');
  expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3);
  expect(html).not.toContain('type="radio"');
  expect(html).toContain('0 of 2 chosen');
});

test('a triggered ability has no Cancel button', async () => {
  const store = await must(asksModes('SYNTHETIC Modal Greeter', 'trigger'));
  const html = renderWith(store, layer);
  expect(html).toContain('aria-label="Choose modes"');
  expect(html).toContain('SYNTHETIC Modal Greeter&#x27;s ability');
  expect(html).not.toContain('>Cancel<');
});

test('the targets of a chosen mode are grouped under "Mode N: text" in the dock and the prompt', async () => {
  const store = await must((v) => asksModes(THREE)(v) && someCreature(v));
  await store.getState().act({ kind: 'chooseModes', modes: [0] });
  const view = store.getState().snapshot?.view;
  expect(view?.pending?.kind).toBe('targets');
  const html = renderWith(store, layer);
  expect(html).toContain('Mode 1: Deals 3 damage to target creature');
  expect(html).toContain('dec-target-group');
  expect(html).toContain(
    `Mode 1: Deals 3 damage to target creature. Choose a target for ${THREE}.`,
  );
  // The spell on the stack says what was chosen.
  expect(renderWith(store, <StackPanel />)).toContain('Chosen: Deals 3 damage to target creature');
});

const stackSpell = (patch: Partial<ObjectView>): ObjectView =>
  ({
    id: 'o900',
    owner: 0,
    controller: 0,
    zone: 'stack',
    name: 'SYNTHETIC Hunt Charm',
    manaCost: ['R'],
    supertypes: [],
    types: ['instant'],
    subtypes: [],
    colors: ['R'],
    power: null,
    toughness: null,
    oracleText: 'Choose one — • Destroy target artifact. • Draw a card.',
    counters: {},
    keywords: [],
    isCommander: false,
    isToken: false,
    support: 'supported',
    targets: [],
    tapped: false,
    damage: 0,
    summoningSick: false,
    protector: null,
    ...patch,
  }) as ObjectView;

test('the stack and the preview list the chosen modes in printed order', async () => {
  const store = await must(asksModes(THREE));
  const snap = store.getState().snapshot;
  if (snap === null) throw new Error('no game');
  const spell = stackSpell({
    modes: [0, 1],
    modeTexts: ['Destroy target artifact.', 'Draw a card.', 'You gain 3 life.'],
  });
  store.setState({ snapshot: { ...snap, view: { ...snap.view, stack: [spell] } } });
  const stack = renderWith(store, <StackPanel />);
  expect(stack).toContain('Chosen: Destroy target artifact; Draw a card');
  expect(stack).not.toContain('You gain 3 life');
  store.getState().hover(spell.id);
  const preview = renderWith(store, <PreviewPanel />);
  expect(preview).toContain('Modes chosen');
  expect(preview).toContain('Destroy target artifact; Draw a card');
});

test('a spell without chosen modes shows no "Chosen" line', async () => {
  const store = await must(asksModes(THREE));
  const snap = store.getState().snapshot;
  if (snap === null) throw new Error('no game');
  store.setState({
    snapshot: { ...snap, view: { ...snap.view, stack: [stackSpell({})] } },
  });
  expect(renderWith(store, <StackPanel />)).not.toContain('Chosen:');
});

test('the trigger-ordering panel words each trigger from its event, and falls back to the rules text', async () => {
  const store = await must(asksModes(THREE));
  const entersThis: Trigger = { kind: 'entersBattlefield', what: { kind: 'this' } };
  const drawn: Trigger = { kind: 'drawn', who: 'you' };
  const odd = { kind: 'somethingNew' } as unknown as Trigger;
  type TriggerChoice = OrderTriggersDecision['triggers'][number];
  const choice = (n: number, trigger: Trigger | undefined): TriggerChoice => ({
    source: `o${n}` as TriggerChoice['source'],
    sourceName: `Source ${n}`,
    sourceOracleText: `Rules text ${n}`,
    abilityIndex: 0,
    count: 1,
    ...(trigger === undefined ? {} : { trigger }),
  });
  const decision: OrderTriggersDecision = {
    id: 'd1' as OrderTriggersDecision['id'],
    kind: 'orderTriggers',
    seat: 0,
    triggers: [choice(1, entersThis), choice(2, drawn), choice(3, odd), choice(4, undefined)],
  };
  const html = renderWith(
    store,
    <OrderPanel
      decision={decision}
      index={new Map()}
      ui={initialUi(decision)}
      update={() => undefined}
    />,
  );
  expect(html).toContain('Whenever Source 1 enters');
  expect(html).toContain('Whenever you draw a card');
  // A shape the words do not know, and an engine that sent none: the source's rules text.
  expect(html).toContain('>Rules text 3<');
  expect(html).toContain('>Rules text 4<');
  expect(html).not.toContain('>Rules text 1<');
  // Every row still names its source.
  for (const n of [1, 2, 3, 4]) expect(html).toContain(`Source ${n}`);
});

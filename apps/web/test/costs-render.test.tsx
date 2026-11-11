/**
 * Additional costs, cost reductions and free casts (D-095, D-101) rendered: the cost a card has now
 * on its frame and in the preview, the additional cost in the preview, the "free" badge, and the
 * sacrifice, discard and Ward questions with their Cancel. Real games of the hidden SYNTHETIC deck
 * `synthetic-costs` for the questions, fake views for the frame.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { CardFace } from '../src/ui/board/CardFace';
import { Hand } from '../src/ui/board/Hand';
import { PreviewPanel } from '../src/ui/board/PreviewPanel';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import {
  castOptions,
  myCreatures,
  onBattlefield,
  PLAIN,
  searchCosts,
  startStore,
  startWardStore,
} from './costs-decks';
import {
  castAt,
  castOption,
  handOf,
  passUntilAsked,
  permanent,
  searchWard,
  type WardStore,
} from './ward-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 60_000 });

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: WardStore) => ({ ...store, getInitialState: () => store.getState() });
const render = (store: WardStore, node: ReactNode): string =>
  renderToStaticMarkup(<StoreProvider store={live(store)}>{node}</StoreProvider>);
const layer = (store: WardStore) =>
  render(
    store,
    <DecisionLayer>
      <div />
    </DecisionLayer>,
  );

const frame = (patch: Partial<ObjectView>): ObjectView =>
  ({
    id: 'o1',
    owner: 0,
    controller: 0,
    zone: 'hand',
    name: 'Grizzly Bears',
    manaCost: ['1', 'G'],
    supertypes: [],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    power: 2,
    toughness: 2,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    ...patch,
  }) as ObjectView;

const html = (object: ObjectView, variant: 'full' | 'hand' = 'hand') =>
  renderToStaticMarkup(
    <StoreProvider store={undefined as never}>
      <CardFace object={object} variant={variant} />
    </StoreProvider>,
  );

test('a card whose cost changed shows the cost now, outlined, with the printed cost in its title', () => {
  const out = html(frame({ castCost: ['G'] }));
  expect(out).toContain('class="board-cost-now"');
  expect(out).toContain('title="Costs {G} now (printed {1}{G}).');
  expect(out).toContain('data-cost-changed="true"');
  expect(out).toContain('aria-label="G mana"');
  expect(out).not.toContain('aria-label="1 mana"');
});

test('a cost reduced to nothing shows {0}, and an unchanged cost shows no outline', () => {
  const none = html(frame({ castCost: [] }));
  expect(none).toContain('class="board-cost-now"');
  expect(none).toContain('aria-label="0 mana"');
  const same = html(frame({ castCost: ['1', 'G'] }));
  expect(same).not.toContain('board-cost-now');
  expect(same).toContain('aria-label="1 mana"');
});

test('a spell cast without paying its mana cost carries the "free" badge on its frame', () => {
  const free = html(frame({ zone: 'stack', free: true }));
  expect(free).toContain('>free<');
  expect(free).toContain('Cast without paying its mana cost.');
  expect(html(frame({ zone: 'stack' }))).not.toContain('>free<');
});

async function reach(
  accept: (view: GameView) => boolean,
  play = PLAIN,
): Promise<{ store: WardStore; view: GameView }> {
  const reached = await searchCosts(startStore, accept, { play });
  if (reached === null) throw new Error('no seed reaches the situation');
  const { store } = reached.session as typeof reached.session & { store: WardStore };
  const view = store.getState().snapshot?.view;
  if (view === undefined) throw new Error('no game');
  return { store, view };
}

test('the hand shows the reduced cost and the preview says "Cost now" with the printed cost', async () => {
  const giant = (c: { name: string; types: readonly string[] }) =>
    (c.types.includes('creature') && c.name !== 'Grizzly Bears') ||
    c.name === 'Sol Ring' ||
    c.name === 'SYNTHETIC Giant Discount';
  const { store, view } = await reach(
    (v) =>
      onBattlefield(v, 'SYNTHETIC Giant Discount') !== undefined &&
      castOptions(v, 'Grizzly Bears').length > 0,
    giant,
  );
  const bears = handOf(view).find((c) => c.name === 'Grizzly Bears');
  if (bears === undefined) throw new Error('no Bears');
  const inHand = render(store, <Hand cards={handOf(view)} />);
  expect(inHand).toContain('Costs {G} now (printed {1}{G})');
  store.getState().pin(bears.id);
  const preview = render(store, <PreviewPanel />);
  expect(preview).toContain('<dt>Cost now</dt>');
  expect(preview).toContain('{G} (printed {1}{G})');
});

test('the preview of a card with an additional cost lists it', async () => {
  const { store, view } = await reach(
    (v) => castOptions(v, 'SYNTHETIC Sacrifice Draw').length > 0 && myCreatures(v).length >= 2,
  );
  const card = handOf(view).find((c) => c.name === 'SYNTHETIC Sacrifice Draw');
  if (card === undefined) throw new Error('no card');
  store.getState().pin(card.id);
  const preview = render(store, <PreviewPanel />);
  expect(preview).toContain('<dt>Additional cost</dt>');
  expect(preview).toContain('Sacrifice a creature');
  // A card with no tax or reduction has no "Cost now" row.
  expect(preview).not.toContain('<dt>Cost now</dt>');
});

test('the sacrifice question of a cast: the prompt, the panel and a Cancel', async () => {
  const spell = 'SYNTHETIC Sacrifice Draw';
  const { store, view } = await reach(
    (v) => castOptions(v, spell).length > 0 && myCreatures(v).length >= 2,
  );
  const option = castOptions(view, spell)[0];
  if (option === undefined) throw new Error('not castable');
  await store.getState().act(option);
  if (store.getState().snapshot?.view.pending?.kind === 'payMana') {
    await store.getState().act({ kind: 'payAuto' });
  }
  expect(store.getState().snapshot?.view.pending?.kind).toBe('choosePermanent');
  const out = layer(store);
  expect(out).toContain(`Sacrifice a creature as an additional cost to cast ${spell}.`);
  expect(out).toContain(`Sacrifice to cast ${spell}`);
  expect(out).toContain('aria-label="Permanents to sacrifice"');
  expect(out).toContain('>Cancel<');
  expect(out).toMatch(/<button[^>]*disabled[^>]*data-dec-primary/);
});

test('the discard question of a cast: the prompt, the panel title and a Cancel', async () => {
  const spell = 'SYNTHETIC Discard Burn';
  const { store, view } = await reach(
    (v) => castOptions(v, spell).length > 0 && handOf(v).length >= 3,
  );
  const option = castOptions(view, spell)[0];
  if (option === undefined) throw new Error('not castable');
  await store.getState().act(option);
  // The burn needs a target: the first legal one, then the payment.
  for (let step = 0; step < 4; step += 1) {
    const pending = store.getState().snapshot?.view.pending;
    if (pending?.kind === 'targets') {
      await store.getState().act({
        kind: 'chooseTargets',
        targets: pending.specs.flatMap((s) => s.legal.slice(0, 1)),
      });
    } else if (pending?.kind === 'payMana') {
      await store.getState().act({ kind: 'payAuto' });
    }
  }
  expect(store.getState().snapshot?.view.pending?.kind).toBe('chooseCards');
  const out = layer(store);
  expect(out).toContain(`Discard a card as an additional cost to cast ${spell}.`);
  expect(out).toContain(`Discard to cast ${spell}`);
  expect(out).toContain('>Cancel<');
});

test("Ward's discard: no Cancel and the ward wording on the question and on the choice", async () => {
  const GUARD = 'SYNTHETIC Tithe Warded Guard';
  const reached = await searchWard(
    startWardStore,
    (v) =>
      castOption(v, 'Lightning Bolt') !== null &&
      permanent(v, GUARD, false) !== undefined &&
      v.battlefield.some((o) => o.controller === v.viewer && !o.tapped && o.name === 'Mountain') &&
      handOf(v).length >= 3,
  );
  if (reached === null) throw new Error('no seed reaches the situation');
  const { store } = reached.session as typeof reached.session & { store: WardStore };
  const target = permanent(reached.session.snapshot().view, GUARD, false);
  if (target === undefined) throw new Error('no Guard');
  await castAt(reached.session, 'Lightning Bolt', target.id);
  await passUntilAsked(reached.session);
  const question = layer(store);
  expect(question).toContain('aria-label="Ward"');
  expect(question).toContain('Discard a card or Lightning Bolt is countered?');
  expect(question).toMatch(/<button[^>]*data-dec-primary[^>]*>Discard<\/button>/);
  expect(question).toContain('>Don&#x27;t discard<');
  expect(question).not.toContain('>Cancel<');

  await store.getState().act({ kind: 'acceptOptional' });
  expect(store.getState().snapshot?.view.pending?.kind).toBe('chooseCards');
  const choice = layer(store);
  expect(choice).toContain('Discard a card or Lightning Bolt is countered?');
  expect(choice).not.toContain('>Cancel<');
});

test('a free cast leaves the spell on the stack with the "free" badge in the stack panel', async () => {
  const SPELL = 'SYNTHETIC Free Colossus';
  const free = (c: { name: string }) =>
    c.name === 'Isamaru, Hound of Konda' || c.name === 'Sol Ring' || c.name === 'Grizzly Bears';
  const { store, view } = await reach(
    (v) => castOptions(v, SPELL).some((o) => o.alternative === 'free'),
    free,
  );
  const option = castOptions(view, SPELL).find((o) => o.alternative === 'free');
  if (option === undefined) throw new Error('no free option');
  // Full Control keeps the spell on the stack, where its badge can be read.
  store.getState().setSettings({ fullControl: true });
  await store.getState().act(option);
  const spell = store.getState().snapshot?.view.stack.find((o) => o.name === SPELL);
  expect(spell?.free).toBe(true);
  expect(render(store, <StackPanel />)).toContain('>free<');
});

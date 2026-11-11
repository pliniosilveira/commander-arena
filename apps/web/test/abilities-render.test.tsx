/** The ability chooser, the sacrifice cost's Cancel and the stack panel's wording, rendered. */
import type { Action, GameView, PriorityDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { AbilityChooser } from '../src/ui/decisions/AbilityChooser';
import type { MenuItem } from '../src/ui/decisions/abilities';
import { ChooserPopover } from '../src/ui/decisions/Chooser';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';
import { type AbilitiesStore, reachAbilitiesStore } from './abilities-decks';
import { lookupIndexFor } from './decisions-helpers';

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: AbilitiesStore) => ({ ...store, getInitialState: () => store.getState() });

/** My turn, an Altar I can activate, and two creatures so that the sacrifice is a real choice. */
const altarCreatures = (view: GameView) => {
  const altar = view.battlefield.find((o) => o.name === 'SYNTHETIC Altar');
  return (
    view.activeSeat === view.viewer &&
    view.pending?.kind === 'priority' &&
    view.pending.options.some((o) => o.kind === 'activate' && o.object === altar?.id) &&
    view.battlefield.filter((o) => o.types.includes('creature') && o.controller === view.viewer)
      .length >= 2
  );
};

const activateOf = (view: GameView, name: string): Action => {
  const id = view.battlefield.find((o) => o.name === name)?.id;
  const option =
    view.pending?.kind === 'priority'
      ? view.pending.options.find((o) => o.kind === 'activate' && o.object === id)
      : undefined;
  if (option?.kind !== 'activate') throw new Error(`no activation of ${name}`);
  return option;
};

const items: MenuItem[] = [
  { key: 'cast', label: 'Cast Cycling Bear', action: { kind: 'castSpell', object: 'o1' } },
  {
    key: 'activate-1',
    label: 'Cycling {2}',
    action: { kind: 'activate', object: 'o1', abilityIndex: 1 },
  },
];

test('the chooser lists one button per choice, plus Close, with the first one first', () => {
  const html = renderToStaticMarkup(
    <AbilityChooser
      items={items}
      anchor={{ object: 'o1', left: 4, top: 8 }}
      pick={() => {}}
      close={() => {}}
    />,
  );
  expect(html).toContain('<legend class="dec-sr">Choose an ability</legend>');
  expect(html.indexOf('Cast Cycling Bear')).toBeLessThan(html.indexOf('Cycling {2}'));
  expect(html.match(/<button/g)).toHaveLength(3);
  expect(html).toContain('aria-label="Close"');
  expect(html).toContain('left:4px');
});

test('the popover shows the menu for a card with a cast and a cycling option', () => {
  const card = {
    id: 'o1',
    name: 'Cycling Bear',
    zone: 'hand',
    types: ['creature'],
    activated: [
      {
        abilityIndex: 1,
        ability: {
          kind: 'activated',
          cost: [{ kind: 'discardThis' }, { kind: 'mana', symbols: ['2'] }],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          functionsIn: 'hand',
        },
      },
    ],
  };
  const pending: PriorityDecision = {
    id: 'd1',
    seat: 0,
    kind: 'priority',
    options: [
      { kind: 'pass' },
      { kind: 'castSpell', object: 'o1' },
      { kind: 'activate', object: 'o1', abilityIndex: 1 },
    ],
  };
  const ui: UiState = { ...initialUi(pending), chooser: { object: 'o1', left: 0, top: 0 } };
  const index = lookupIndexFor([card as never]);
  const html = renderToStaticMarkup(
    <ChooserPopover
      pending={pending}
      ui={ui}
      act={() => {}}
      update={() => {}}
      close={() => {}}
      index={index}
    />,
  );
  expect(html).toContain('Cast Cycling Bear');
  expect(html).toContain('Cycling {2}');
  // No chooser is drawn when the object has a single thing to do.
  const single = renderToStaticMarkup(
    <ChooserPopover
      pending={{ ...pending, options: [{ kind: 'pass' }, { kind: 'castSpell', object: 'o1' }] }}
      ui={ui}
      act={() => {}}
      update={() => {}}
      close={() => {}}
      index={index}
    />,
  );
  expect(single).toBe('');
});

test('a sacrifice cost: the prompt says it pays, the panel has Cancel and the bar is the usual one', async () => {
  const store = await reachAbilitiesStore(altarCreatures, (view) =>
    activateOf(view, 'SYNTHETIC Altar'),
  );
  if (store === null) throw new Error('no seed');
  const pending = store.getState().snapshot?.view.pending;
  if (pending?.kind !== 'choosePermanent') throw new Error(`pending is ${pending?.kind}`);
  expect(pending.forCost).toBe(true);
  const html = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <div />
      </DecisionLayer>
    </StoreProvider>,
  );
  expect(html).toContain('Sacrifice a permanent to pay for SYNTHETIC Altar.');
  expect(html).toContain('Sacrifice to pay for SYNTHETIC Altar');
  expect(html).toMatch(/<button[^>]*title="Esc"[^>]*>Cancel<\/button>/);
  expect(html).toContain('>Confirm<');
});

test('the stack panel shows an activated ability as one, under its source', async () => {
  const store = await reachAbilitiesStore(altarCreatures, (view) =>
    activateOf(view, 'SYNTHETIC Altar'),
  );
  if (store === null) throw new Error('no seed');
  // Answer the cost by sacrificing the first legal creature. Full Control keeps the ability on
  // the stack, with the player holding priority, instead of the autopilot resolving it.
  const pending = store.getState().snapshot?.view.pending;
  if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
  store.getState().setSettings({ fullControl: true });
  await store.getState().act({ kind: 'choosePermanents', objects: pending.legal.slice(0, 1) });
  expect(store.getState().error).toBeNull();
  expect(store.getState().snapshot?.view.stack).toHaveLength(1);
  const html = renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <StackPanel />
    </StoreProvider>,
  );
  expect(html).toContain('Activated ability');
  expect(html).not.toContain('Triggered ability');
  expect(html).toContain('SYNTHETIC Altar');
});

/**
 * The web side of D-222 (CR 601.2b, 605.3b): the player chooses the permanent a mana ability "Sacrifice a Spirit: Add {R}." gives up, while paying by
 * clicking sources and when activating the ability at priority.
 */
import type { ObjectView, PayManaDecision, PriorityDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { menuItems } from '../src/ui/decisions/abilities';
import { ChooserPopover } from '../src/ui/decisions/Chooser';
import {
  asksChoice,
  clickSource,
  setTapColor,
  setTapSacrifice,
  tapBadges,
} from '../src/ui/decisions/payment';
import { clickOutcome } from '../src/ui/decisions/priority';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const noop = () => {};
const named = (id: string, name: string) =>
  ({ id, name, oracleText: '', controller: 0 }) as unknown as ObjectView;
const index = lookupIndexFor([
  named('o1', "Kykar, Wind's Fury"),
  named('o2', 'Spirit token'),
  named('o3', 'Dawn Spirit'),
]);

const sources: PayManaDecision['manaSources'] = [
  { object: 'o1', abilityIndex: 2, sacrifices: ['o2', 'o3'] },
  { object: 'o9', abilityIndex: 0 },
];

test('a source that sacrifices one of several permanents asks first; a click does not tap it', () => {
  expect(asksChoice(sources[0] as PayManaDecision['manaSources'][number])).toBe(true);
  expect(asksChoice(sources[1] as PayManaDecision['manaSources'][number])).toBe(false);
  expect(clickSource([], sources, 'o1')).toEqual({ kind: 'choose', abilityIndex: 2 });
});

test('the tap names the permanent chosen, only one the engine offered', () => {
  expect(setTapSacrifice([], sources, 'o1', 2, 'o3')).toEqual([
    { object: 'o1', abilityIndex: 2, sacrifice: 'o3' },
  ]);
  expect(setTapSacrifice([], sources, 'o1', 2, 'o7')).toEqual([]);
  // Choosing again replaces the earlier tap and keeps its place.
  const taps = setTapSacrifice(
    [
      { object: 'o9', abilityIndex: 0 },
      { object: 'o1', abilityIndex: 2, sacrifice: 'o2' },
    ],
    sources,
    'o1',
    2,
    'o3',
  );
  expect(taps.map((t) => [t.object, t.sacrifice])).toEqual([
    ['o9', undefined],
    ['o1', 'o3'],
  ]);
  expect(tapBadges(taps).get('o1')).toBe('2');
});

test('a source that also asks a color keeps the permanent through the second question', () => {
  const both: PayManaDecision['manaSources'] = [
    { object: 'o1', abilityIndex: 0, colors: ['R', 'G'], sacrifices: ['o2', 'o3'] },
  ];
  expect(setTapColor([], both, 'o1', 0, 'G', 'o3')).toEqual([
    { object: 'o1', abilityIndex: 0, color: 'G', sacrifice: 'o3' },
  ]);
});

const payment = {
  kind: 'payMana',
  id: 1,
  seat: 0,
  source: 'o8',
  totalCost: ['R'],
  manaSources: sources,
} as unknown as PayManaDecision;

test('paying: the popover lists the Spirits by name', () => {
  const ui: UiState = {
    ...initialUi(payment),
    chooser: { object: 'o1', abilityIndex: 2, left: 0, top: 0 },
  };
  const html = renderToStaticMarkup(
    <ChooserPopover
      pending={payment}
      ui={ui}
      act={noop}
      update={noop}
      close={noop}
      index={index}
    />,
  );
  expect(html).toContain('Sacrifice which permanent?');
  expect(html).toContain('Spirit token');
  expect(html).toContain('Dawn Spirit');
});

const priority = {
  kind: 'priority',
  id: 2,
  seat: 0,
  options: [
    { kind: 'activateAbility', source: 'o1', abilityIndex: 2, color: null, sacrifice: 'o2' },
    { kind: 'activateAbility', source: 'o1', abilityIndex: 2, color: null, sacrifice: 'o3' },
  ],
} as unknown as PriorityDecision;

test('at priority: one choice for each permanent, naming it, and the action carries it', () => {
  const outcome = clickOutcome(priority, 'o1', index);
  if (outcome.kind !== 'choose') throw new Error('expected a choice');
  expect(outcome.choices.map((c) => c.sacrificeName)).toEqual(['Spirit token', 'Dawn Spirit']);
  expect(outcome.choices.map((c) => c.action.sacrifice)).toEqual(['o2', 'o3']);
  const html = renderToStaticMarkup(
    <ChooserPopover
      pending={priority}
      ui={{ ...initialUi(priority), chooser: { object: 'o1', left: 0, top: 0 } }}
      act={noop}
      update={noop}
      close={noop}
      index={index}
    />,
  );
  expect(html).toContain('Sacrifice Spirit token');
  expect(html).toContain('Sacrifice Dawn Spirit');
});

test('in a menu the items name the permanent and are told apart', () => {
  const items = menuItems(priority, 'o1', index);
  expect(items.map((i) => i.label)).toEqual([
    'Mana ability 3, sacrificing Spirit token',
    'Mana ability 3, sacrificing Dawn Spirit',
  ]);
  expect(new Set(items.map((i) => i.key)).size).toBe(2);
  expect(items.map((i) => i.action)).toMatchObject([{ sacrifice: 'o2' }, { sacrifice: 'o3' }]);
});

// D-223 (CR 701.50c): the question of which of several permanents connives next.
test('the connive question has its own words and badge', async () => {
  const { angelsBadge, angelsPermanentPrompt } = await import(
    '../src/ui/decisions/permanents-angels'
  );
  const d = {
    kind: 'choosePermanent',
    id: 3,
    seat: 0,
    source: 'o1',
    purpose: 'conniveOrder',
    min: 1,
    max: 1,
    legal: ['o2', 'o3'],
  } as unknown as import('@commander-arena/engine').ChoosePermanentDecision;
  expect(angelsPermanentPrompt(d, index)).toBe(
    "Several permanents connive: choose which of yours connives next (Kykar, Wind's Fury).",
  );
  expect(angelsBadge(d, index)).toBe('Connives');
});

// D-225 (CR 701.20a): the card revealed for a land's "you may reveal a card" is chosen among several.
test('the reveal choice says Reveal on the button and the chosen card', async () => {
  const { confirmLabel, foundBadge } = await import('../src/ui/decisions/cards-picker');
  expect(confirmLabel({ purpose: 'reveal' }, ['o4'])).toBe('Reveal');
  expect(foundBadge({ purpose: 'reveal', max: 1 }, ['o4'], 'o4')).toBe('Reveal');
});

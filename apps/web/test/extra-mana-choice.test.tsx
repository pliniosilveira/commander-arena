/**
 * The web side of "Whenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." (CR 605.1b, 106.1b, 605.3b): the player chooses the color
 * of the additional mana while paying by clicking sources and when tapping the land at priority.
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
  setTapExtra,
  tapBadges,
} from '../src/ui/decisions/payment';
import { clickOutcome } from '../src/ui/decisions/priority';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const noop = () => {};
const named = (id: string, name: string) =>
  ({ id, name, oracleText: '', controller: 0 }) as unknown as ObjectView;
const index = lookupIndexFor([named('o1', 'Forest'), named('o2', 'Command Tower')]);

const EXTRAS = [['W'], ['U'], ['B'], ['R'], ['G']] as const;
const sources: PayManaDecision['manaSources'] = [
  { object: 'o1', abilityIndex: 0, extraColors: EXTRAS },
  { object: 'o2', abilityIndex: 0, colors: ['W', 'U'], extraColors: EXTRAS },
  { object: 'o9', abilityIndex: 0 },
];

test('a land with an additional mana to choose asks first; a click does not tap it', () => {
  expect(asksChoice(sources[0] as PayManaDecision['manaSources'][number])).toBe(true);
  expect(asksChoice(sources[2] as PayManaDecision['manaSources'][number])).toBe(false);
  expect(clickSource([], sources, 'o1')).toEqual({ kind: 'choose', abilityIndex: 0 });
});

test('the tap names the additional mana, only one the engine offered, and keeps the color chosen before', () => {
  expect(setTapExtra([], sources, 'o1', 0, ['C'])).toEqual([]);
  expect(setTapExtra([], sources, 'o1', 0, ['R'])).toEqual([
    { object: 'o1', abilityIndex: 0, extraColors: ['R'] },
  ]);
  expect(setTapExtra([], sources, 'o2', 0, ['R'], { color: 'U' })).toEqual([
    { object: 'o2', abilityIndex: 0, color: 'U', extraColors: ['R'] },
  ]);
  // The color step of a land that also asks the additional mana does not tap by itself in the popover; the function still keeps both when used.
  expect(setTapColor([], sources, 'o2', 0, 'W')).toEqual([
    { object: 'o2', abilityIndex: 0, color: 'W' },
  ]);
});

test('the badge of a tap says the additional mana too', () => {
  const badges = tapBadges([
    { object: 'o1', abilityIndex: 0, extraColors: ['R'] },
    { object: 'o2', abilityIndex: 0, color: 'U', extraColors: ['G'] },
  ]);
  expect(badges.get('o1')).toBe('1 (+R)');
  expect(badges.get('o2')).toBe('2 (U+G)');
});

const payment = {
  kind: 'payMana',
  id: 1,
  seat: 0,
  source: 'o8',
  totalCost: ['R'],
  manaSources: sources,
} as unknown as PayManaDecision;

const render = (ui: UiState) =>
  renderToStaticMarkup(
    <ChooserPopover
      pending={payment}
      ui={ui}
      act={noop}
      update={noop}
      close={noop}
      index={index}
    />,
  );

test('paying: a land that only asks the additional mana opens that question at once', () => {
  const html = render({
    ...initialUi(payment),
    chooser: { object: 'o1', abilityIndex: 0, left: 0, top: 0 },
  });
  expect(html).toContain('Additional mana of which color?');
  expect(html).toContain('Add an additional R');
  expect(html).toContain('Add an additional G');
});

test('paying: a land that asks its color asks that first, then the additional mana', () => {
  const first = render({
    ...initialUi(payment),
    chooser: { object: 'o2', abilityIndex: 0, left: 0, top: 0 },
  });
  expect(first).toContain('Choose a color of mana');
  expect(first).not.toContain('Additional mana of which color?');
  const second = render({
    ...initialUi(payment),
    chooser: { object: 'o2', abilityIndex: 0, color: 'U', left: 0, top: 0 },
  });
  expect(second).toContain('Additional mana of which color?');
});

const priority = {
  kind: 'priority',
  id: 2,
  seat: 0,
  options: EXTRAS.map((extraColors) => ({
    kind: 'activateAbility',
    source: 'o1',
    abilityIndex: 0,
    color: null,
    extraColors,
  })),
} as unknown as PriorityDecision;

test('at priority: tapping the land asks the color of the additional mana, one choice for each', () => {
  const outcome = clickOutcome(priority, 'o1', index);
  expect(outcome.kind).toBe('choose');
  if (outcome.kind !== 'choose') return;
  expect(outcome.choices.map((c) => c.extraColors?.join('')).sort()).toEqual([
    'B',
    'G',
    'R',
    'U',
    'W',
  ]);
  expect(outcome.choices[0]?.action).toMatchObject({ kind: 'activateAbility', source: 'o1' });
  expect(outcome.choices.every((c) => c.action.extraColors !== undefined)).toBe(true);
  expect(outcome.choices[0]?.label).toContain('additional');
});

test('at priority: the menu keeps one item for each color of the additional mana, with its own key', () => {
  const items = menuItems(priority, 'o1', index);
  expect(items).toHaveLength(5);
  expect(new Set(items.map((i) => i.key)).size).toBe(5);
  expect(items.every((i) => i.label.includes('additional'))).toBe(true);
});

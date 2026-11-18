/**
 * The web side of D-609 (CR 601.2b, 605.3b): the player chooses the permanent a mana ability "{T}, Tap an untapped creature you control: Add one mana of any color."
 * taps as part of its cost, while paying by clicking sources and when activating the ability at priority.
 */
import type { ObjectView, PayManaDecision, PriorityDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { menuItems } from '../src/ui/decisions/abilities';
import { ChooserPopover } from '../src/ui/decisions/Chooser';
import { asksChoice, clickSource, setTapColor, setTapTapped } from '../src/ui/decisions/payment';
import { clickOutcome } from '../src/ui/decisions/priority';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const noop = () => {};
const named = (id: string, name: string) =>
  ({ id, name, oracleText: '', controller: 0 }) as unknown as ObjectView;
const index = lookupIndexFor([
  named('o1', 'Jaspera Sentinel'),
  named('o2', 'Grizzly Bears'),
  named('o3', 'Llanowar Elves'),
]);

const sources: PayManaDecision['manaSources'] = [
  { object: 'o1', abilityIndex: 1, colors: ['W', 'U'], tappables: ['o2', 'o3'] },
  { object: 'o9', abilityIndex: 0 },
];

test('a source that taps one of several creatures asks first; a click does not tap it', () => {
  expect(asksChoice(sources[0] as PayManaDecision['manaSources'][number])).toBe(true);
  expect(clickSource([], sources, 'o1')).toEqual({ kind: 'choose', abilityIndex: 1 });
});

test('the tap names the creature chosen, only one the engine offered, and keeps it through the color question', () => {
  expect(setTapTapped([], sources, 'o1', 1, 'o7')).toEqual([]);
  expect(
    setTapTapped([], [{ object: 'o1', abilityIndex: 1, tappables: ['o2', 'o3'] }], 'o1', 1, 'o3'),
  ).toEqual([{ object: 'o1', abilityIndex: 1, tapped: 'o3' }]);
  expect(setTapColor([], sources, 'o1', 1, 'U', undefined, 'o3')).toEqual([
    { object: 'o1', abilityIndex: 1, color: 'U', tapped: 'o3' },
  ]);
});

const payment = {
  kind: 'payMana',
  id: 1,
  seat: 0,
  source: 'o8',
  totalCost: ['U'],
  manaSources: sources,
} as unknown as PayManaDecision;

test('paying: the popover lists the creatures by name, then the color', () => {
  const first: UiState = {
    ...initialUi(payment),
    chooser: { object: 'o1', abilityIndex: 1, left: 0, top: 0 },
  };
  const html = renderToStaticMarkup(
    <ChooserPopover
      pending={payment}
      ui={first}
      act={noop}
      update={noop}
      close={noop}
      index={index}
    />,
  );
  expect(html).toContain('Tap which permanent?');
  expect(html).toContain('Grizzly Bears');
  expect(html).toContain('Llanowar Elves');
  const second: UiState = {
    ...initialUi(payment),
    chooser: { object: 'o1', abilityIndex: 1, tapped: 'o2', left: 0, top: 0 },
  };
  const colors = renderToStaticMarkup(
    <ChooserPopover
      pending={payment}
      ui={second}
      act={noop}
      update={noop}
      close={noop}
      index={index}
    />,
  );
  expect(colors).not.toContain('Tap which permanent?');
  expect(colors).toContain('Choose a color of mana');
});

const priority = {
  kind: 'priority',
  id: 2,
  seat: 0,
  options: [
    { kind: 'activateAbility', source: 'o1', abilityIndex: 1, color: 'W', tapped: 'o2' },
    { kind: 'activateAbility', source: 'o1', abilityIndex: 1, color: 'W', tapped: 'o3' },
  ],
} as unknown as PriorityDecision;

test('at priority: one choice for each creature, naming it, and the action carries it', () => {
  const outcome = clickOutcome(priority, 'o1', index);
  if (outcome.kind !== 'choose') throw new Error('expected a choice');
  expect(outcome.choices.map((c) => c.tappedName)).toEqual(['Grizzly Bears', 'Llanowar Elves']);
  expect(outcome.choices.map((c) => c.action.tapped)).toEqual(['o2', 'o3']);
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
  expect(html).toContain('Tap Grizzly Bears');
  expect(html).toContain('Tap Llanowar Elves');
});

test('in a menu the items name the creature and are told apart', () => {
  const items = menuItems(priority, 'o1', index);
  expect(items.map((i) => i.label)).toEqual([
    'Add W, tapping Grizzly Bears',
    'Add W, tapping Llanowar Elves',
  ]);
  expect(new Set(items.map((i) => i.key)).size).toBe(2);
  expect(items.map((i) => i.action)).toMatchObject([{ tapped: 'o2' }, { tapped: 'o3' }]);
});

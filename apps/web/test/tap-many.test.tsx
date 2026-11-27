/**
 * The web side of "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors." (Hazel of the Rootbloom; CR 107.3, 106.1b, 605.3b): a click on the
 * source opens a form that builds the activation the engine accepts (the options list only the play that taps every token), and the words of the cost read as the card does.
 */
import {
  applyAction,
  type ObjectView,
  type PriorityDecision,
  syntheticCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { activationCostPart } from '../src/game/cost-text';
import { menuItems } from '../src/ui/decisions/abilities';
import { ChooserPopover } from '../src/ui/decisions/Chooser';
import { clickOutcome, playableObjects } from '../src/ui/decisions/priority';
import {
  allOf,
  NO_COLORS,
  stepColor,
  tapManyAction,
  tapManyOf,
  togglePicked,
  totalOf,
  trimTo,
} from '../src/ui/decisions/tap-many';
import { initialUi } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const noop = () => {};
const named = (id: string, name: string, oracleText = '') =>
  ({ id, name, oracleText, controller: 0 }) as unknown as ObjectView;
const index = lookupIndexFor([
  named(
    'o1',
    'Hazel of the Rootbloom',
    '{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors.',
  ),
  named('o2', 'Squirrel'),
  named('o3', 'Squirrel'),
  named('o4', 'Treasure'),
]);

const priority = {
  kind: 'priority',
  id: 2,
  seat: 0,
  options: [
    { kind: 'pass' },
    {
      kind: 'activateAbility',
      source: 'o1',
      abilityIndex: 0,
      color: null,
      combination: ['G', 'G', 'G'],
      tappedMany: ['o2', 'o3', 'o4'],
    },
    {
      kind: 'activateAbility',
      source: 'o1',
      abilityIndex: 0,
      color: null,
      combination: ['W', 'W', 'W'],
      tappedMany: ['o2', 'o3', 'o4'],
    },
  ],
} as unknown as PriorityDecision;

test('the source is clickable and a click opens the form, not a list of the options', () => {
  expect(playableObjects(priority).has('o1')).toBe(true);
  const outcome = clickOutcome(priority, 'o1', index);
  expect(outcome).toEqual({
    kind: 'tapMany',
    source: 'o1',
    abilityIndex: 0,
    candidates: ['o2', 'o3', 'o4'],
  });
  expect(tapManyOf(priority, 'o2')).toBeNull();
});

test('the form names the permanents (the same names told apart), the life and the five colors', () => {
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
  expect(html).toContain('Squirrel #1');
  expect(html).toContain('Squirrel #2');
  expect(html).toContain('Treasure');
  expect(html).toContain('pay 2 life');
  for (const color of ['white', 'blue', 'black', 'red', 'green']) {
    expect(html).toContain(`More ${color} mana`);
  }
  // Every permanent is ticked to start, and the colors are still to choose: the button says so.
  expect(html).toContain('Choose 3 more');
});

test('the menu of a card with other things to do lists plays the engine accepts', () => {
  const items = menuItems(priority, 'o1', index);
  expect(items).toHaveLength(2);
  for (const item of items) {
    expect(item.action.kind).toBe('activateAbility');
    // The play carries the permanents it taps, or the engine would take it for X = 0 with the wrong number of mana.
    expect(item.action.kind === 'activateAbility' && item.action.tappedMany).toEqual([
      'o2',
      'o3',
      'o4',
    ]);
  }
});

test('the action: as many colors as permanents, in the order of the game; none while they differ', () => {
  const ask = { source: 'o1', abilityIndex: 0, candidates: ['o2', 'o3', 'o4'] } as const;
  expect(tapManyAction(ask, ['o2', 'o3'], NO_COLORS)).toBeNull();
  expect(tapManyAction(ask, ['o2', 'o3'], { ...NO_COLORS, G: 1, W: 1 })).toEqual({
    kind: 'activateAbility',
    source: 'o1',
    abilityIndex: 0,
    color: null,
    combination: ['W', 'G'],
    tappedMany: ['o2', 'o3'],
  });
  // X = 0: nothing ticked, no colors (CR 107.3).
  expect(tapManyAction(ask, [], NO_COLORS)).toEqual({
    kind: 'activateAbility',
    source: 'o1',
    abilityIndex: 0,
    color: null,
    combination: [],
    tappedMany: [],
  });
});

test('colors: steps stay within X, "all" fills it, and unticking a permanent takes the last colors off', () => {
  let counts = stepColor(NO_COLORS, 'U', 1, 2);
  counts = stepColor(counts, 'R', 1, 2);
  expect(totalOf(counts)).toBe(2);
  expect(stepColor(counts, 'G', 1, 2)).toBe(counts);
  expect(stepColor(NO_COLORS, 'U', -1, 2)).toBe(NO_COLORS);
  expect(allOf('B', 3)).toEqual({ ...NO_COLORS, B: 3 });
  expect(trimTo({ ...NO_COLORS, U: 1, R: 1, G: 1 }, 2)).toEqual({ ...NO_COLORS, U: 1, R: 1 });
  expect(togglePicked(['o2', 'o3', 'o4'], ['o2', 'o4'], 'o3')).toEqual(['o2', 'o3', 'o4']);
  expect(togglePicked(['o2', 'o3', 'o4'], ['o2', 'o3', 'o4'], 'o3')).toEqual(['o2', 'o4']);
});

test('the engine takes the action the form builds, for an X the options do not list', () => {
  const g = scenario()
    .seat(0)
    .life(20)
    .battlefield('SYNTHETIC Rootbloom Druid')
    .battlefield('Forest')
    .hand('SYNTHETIC Squirrel Swarm')
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .life(20)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast('SYNTHETIC Squirrel Swarm', { pay: true });
  g.passAll();
  const decision = g.state.pending;
  if (decision?.kind !== 'priority') throw new Error('expected priority');
  const ask = tapManyOf(decision, g.id('SYNTHETIC Rootbloom Druid'));
  if (ask === null) throw new Error('the ability is not on offer');
  expect(ask.candidates).toHaveLength(4);
  const action = tapManyAction(ask, ask.candidates.slice(0, 3), { ...NO_COLORS, R: 2, U: 1 });
  if (action === null) throw new Error('no action');
  const done = applyAction(g.state, 0, action);
  expect(done.ok).toBe(true);
  expect(syntheticCard('SYNTHETIC Rootbloom Druid').name).toBe('SYNTHETIC Rootbloom Druid');
});

test('the words of the cost', () => {
  expect(activationCostPart({ kind: 'tapPermanentsX', filter: { token: true } })).toBe(
    'Tap X untapped tokens you control',
  );
});

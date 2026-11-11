/**
 * The log says which spell or ability resolved and then what it did (issue 105): a board wipe used to
 * show only "Serra Angel dies." lines with nothing to say what killed them. Worded from fake states, like
 * the other describe tests.
 */
import type { GameEvent, GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvents } from '../src/game/describe';

const objects = {
  // The opponent's sorcery on the stack.
  o1: { card: 'c1', token: null, controller: 1, stack: { kind: 'spell' } },
  // A creature of the viewer's, and an ability on the stack.
  o2: { card: 'c2', token: null, controller: 0, stack: null },
  o3: { card: null, token: null, controller: 1, stack: { kind: 'ability', source: 'o4' } },
  o4: { card: 'c3', token: null, controller: 1, stack: null },
};
const cards = { c1: { definition: 'd1' }, c2: { definition: 'd2' }, c3: { definition: 'd3' } };
const definitions = {
  d1: { name: 'Sweeping Doom' },
  d2: { name: 'Serra Angel' },
  d3: { name: 'Wrath Engine' },
};
const state = (stack: string[]) =>
  ({
    objects,
    cards,
    definitions,
    stack,
    lki: {},
    pending: null,
    turn: { activeSeat: 1 },
  }) as unknown as GameState;

const pass = (seat: number): GameEvent => ({ kind: 'priorityPassed', seat }) as GameEvent;

test('a spell that resolves is named before what it did', () => {
  const events = [
    pass(0),
    { kind: 'died', object: 'o2' },
    { kind: 'zoneChanged', from: 'o1', to: 'o1', fromZone: 'stack', toZone: 'graveyard' },
  ] as unknown as GameEvent[];
  const lines = describeEvents(events, state(['o1']), state([]), 0);
  expect(lines.map((l) => l.text)).toEqual([
    'You pass priority.',
    'Sweeping Doom resolves.',
    'Serra Angel dies.',
  ]);
  const lead = lines[1];
  // It did something the log shows, so it is a main line; it stays on the opponent's side.
  expect(lead?.level).toBe('major');
  expect(lead?.seat).toBe(1);
  expect(lead?.objects).toEqual(['o1']);
});

test('a spell that changed nothing the log shows resolves as a detail line', () => {
  const events = [
    pass(0),
    { kind: 'zoneChanged', from: 'o1', to: 'o1', fromZone: 'stack', toZone: 'graveyard' },
  ] as unknown as GameEvent[];
  const lead = describeEvents(events, state(['o1']), state([]), 0).find((l) =>
    l.text.includes('resolves'),
  );
  expect(lead?.level).toBe('detail');
});

test('an ability that resolves is named as the ability of its source', () => {
  const events = [pass(0), { kind: 'died', object: 'o2' }] as unknown as GameEvent[];
  const lines = describeEvents(events, state(['o3']), state([]), 0);
  expect(lines.map((l) => l.text)).toContain("Wrath Engine's ability resolves.");
});

test('a countered or fizzled object, a permanent spell and an object still waiting are not "resolves"', () => {
  const countered = [
    { kind: 'countered', object: 'o1' },
    { kind: 'zoneChanged', from: 'o1', to: 'o1', fromZone: 'stack', toZone: 'graveyard' },
  ] as unknown as GameEvent[];
  expect(
    describeEvents(countered, state(['o1']), state([]), 0).some((l) => l.text.includes('resolves')),
  ).toBe(false);
  const permanent = [
    { kind: 'zoneChanged', from: 'o1', to: 'o1', fromZone: 'stack', toZone: 'battlefield' },
    { kind: 'resolved', object: 'o1' },
  ] as unknown as GameEvent[];
  const lines = describeEvents(permanent, state(['o1']), state([]), 0).filter((l) =>
    l.text.includes('resolves'),
  );
  // Its own detail line, once.
  expect(lines).toHaveLength(1);
  expect(lines[0]?.level).toBe('detail');
  const waiting = [pass(0)] as unknown as GameEvent[];
  expect(describeEvents(waiting, state(['o3']), state(['o3']), 0).map((l) => l.text)).toEqual([
    'You pass priority.',
  ]);
});

test('an action with nothing on the stack adds no line', () => {
  const events = [pass(0)] as unknown as GameEvent[];
  expect(describeEvents(events, state([]), state([]), 0).map((l) => l.text)).toEqual([
    'You pass priority.',
  ]);
});

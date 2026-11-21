/**
 * The cost "Remove two +1/+1 counters from among creatures you control" (Federation Fleet deck, group D; CR 118.3, 122.1) as pure models, no DOM: the words of the cost, the prompt and
 * badge of its question, and the line of the event log.
 */
import type {
  ChoosePermanentDecision,
  GameState,
  ObjectView,
  StackAbility,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText } from '../src/game/cost-text';
import { describeEvent } from '../src/game/describe';
import { choosePermanentPrompt } from '../src/ui/decisions/permanents';
import { angelsBadge, angelsPermanentPrompt } from '../src/ui/decisions/permanents-angels';
import {
  isRemoveCountersCost,
  REMOVE_COUNTERS_COST_BADGE,
  removeCountersCostPrompt,
  removeCountersCostTitle,
} from '../src/ui/decisions/permanents-remove-counters-cost';

const COST = {
  kind: 'removeCounters',
  counter: '+1/+1',
  count: 2,
  among: { types: ['creature'], controller: 'you' },
} as const;

const objectView = (id: string, name: string, extra: object = {}): ObjectView =>
  ({
    id,
    name,
    types: ['creature'],
    subtypes: [],
    supertypes: [],
    oracleText: '',
    controller: 0,
    owner: 0,
    zone: 'battlefield',
    ...extra,
  }) as unknown as ObjectView;

const QUESTION = {
  id: 'd1',
  kind: 'choosePermanent',
  seat: 0,
  purpose: 'removeCountersCost',
  source: 'o9',
  forCost: true,
  min: 1,
  max: 1,
  legal: ['o1', 'o2'],
} as unknown as ChoosePermanentDecision;

const ability = {
  kind: 'activated',
  cost: [{ kind: 'mana', symbols: ['2'] }, COST],
  effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
} as unknown as StackAbility;

const index = new Map<`o${number}`, ObjectView>([
  ['o1', objectView('o1', 'Grizzly Bears')],
  ['o2', objectView('o2', 'Giant Spider')],
  ['o9', objectView('o9', 'Harry', { zone: 'stack', ability })],
]);

describe('the words of the cost', () => {
  test('it reads as Oracle prints it', () => {
    expect(activationCostText([{ kind: 'mana', symbols: ['2'] }, COST])).toBe(
      '{2}, Remove 2 +1/+1 counters from among creatures you control',
    );
    expect(activationCostText([{ ...COST, count: 1 }])).toBe(
      'Remove a +1/+1 counter from among creatures you control',
    );
  });

  test('the plain removal from this permanent keeps its words', () => {
    expect(activationCostText([{ kind: 'removeCounters', counter: 'charge', count: 2 }])).toBe(
      'Remove 2 charge counters',
    );
  });
});

describe('the question of the cost', () => {
  test('the prompt names the creatures and the counter, and none of its words is a sacrifice', () => {
    expect(isRemoveCountersCost(QUESTION)).toBe(true);
    const prompt = removeCountersCostPrompt(QUESTION, index);
    expect(prompt).toBe(
      'Choose one of the creatures you control to remove a +1/+1 counter from, as a cost.',
    );
    expect(angelsPermanentPrompt(QUESTION, index)).toBe(prompt);
    expect(angelsBadge(QUESTION, index)).toBe(REMOVE_COUNTERS_COST_BADGE);
    expect(
      [prompt, removeCountersCostTitle(QUESTION, index), REMOVE_COUNTERS_COST_BADGE].join(' '),
    ).not.toMatch(/[Ss]acrifice/);
  });

  test('another choice of permanents is not worded as this cost', () => {
    const sacrifice = {
      purpose: 'sacrifice',
      min: 1,
      max: 1,
      legal: ['o1'],
      source: 'o9',
    } as never;
    expect(isRemoveCountersCost(sacrifice)).toBe(false);
    expect(angelsPermanentPrompt(sacrifice, index)).toBeNull();
    expect(choosePermanentPrompt(sacrifice, index)).not.toMatch(/remove/i);
  });
});

describe('the log line of the cost', () => {
  const state = {
    objects: {
      o1: { card: 'c1', token: null, stack: null, controller: 0 },
      o2: { card: null, token: null, stack: { kind: 'ability', source: 'o3' }, controller: 0 },
      o3: { card: 'c2', token: null, stack: null, controller: 0 },
    },
    cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
    definitions: { d1: { name: 'Grizzly Bears' }, d2: { name: 'Ensign Harry Kim' } },
    lki: {},
    pending: null,
  } as unknown as GameState;
  const chosen = (automatic: boolean) => ({
    kind: 'permanentsChosen',
    seat: 0,
    source: 'o2',
    objects: ['o1'],
    purpose: 'removeCountersCost',
    automatic,
  });

  test('who gives up a counter, and that there was no other choice', () => {
    expect(describeEvent(chosen(false) as never, state, state, 0)?.text).toBe(
      "You remove a counter from Grizzly Bears to pay for Ensign Harry Kim's ability.",
    );
    expect(describeEvent(chosen(true) as never, state, state, 0)?.text).toBe(
      "You must remove counters from Grizzly Bears to pay for Ensign Harry Kim's ability: no other choice.",
    );
  });
});

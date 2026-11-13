/**
 * The question of a blight cost and its log line (D-407) as pure models, no DOM: the prompt, the badge, the bar's second line and the line of the event log.
 */
import type {
  ChoosePermanentDecision,
  GameState,
  ObjectView,
  StackAbility,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { choosePermanentPrompt } from '../src/ui/decisions/permanents';
import { angelsBadge, angelsPermanentPrompt } from '../src/ui/decisions/permanents-angels';
import {
  BLIGHT_BADGE,
  BLIGHT_TITLE,
  blightDetail,
  blightPrompt,
  isBlight,
} from '../src/ui/decisions/permanents-blight';

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
  purpose: 'blight',
  source: 'o9',
  forCost: true,
  min: 1,
  max: 1,
  legal: ['o1', 'o2'],
} as unknown as ChoosePermanentDecision;

const ability = (count: number): StackAbility =>
  ({
    kind: 'activated',
    cost: [
      { kind: 'mana', symbols: ['1'] },
      { kind: 'blight', count },
    ],
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
  }) as unknown as StackAbility;

const index = (count = 1) =>
  new Map<`o${number}`, ObjectView>([
    ['o1', objectView('o1', 'Orc Army')],
    ['o2', objectView('o2', 'Giant Spider')],
    ['o9', objectView('o9', 'Spiral into Solitude', { zone: 'stack', ability: ability(count) })],
  ]);

describe('the question of a blight cost', () => {
  test('the prompt names the cost, the creature to choose and the ability it pays for', () => {
    expect(isBlight(QUESTION)).toBe(true);
    expect(blightPrompt(QUESTION, index())).toBe(
      'Blight 1: choose a creature you control to put a -1/-1 counter on, to pay for Spiral into Solitude.',
    );
    expect(blightPrompt(QUESTION, index(2))).toBe(
      'Blight 2: choose a creature you control to put 2 -1/-1 counters on, to pay for Spiral into Solitude.',
    );
    expect(angelsPermanentPrompt(QUESTION, index())).toBe(blightPrompt(QUESTION, index()));
    expect(angelsBadge(QUESTION, index())).toBe(BLIGHT_BADGE);
  });

  test('the bar says what a click does and none of its words is a sacrifice', () => {
    expect(blightDetail([], index())).toMatch(/^Click a creature you control/);
    expect(blightDetail(['o2'], index())).toBe(
      'Giant Spider will get the -1/-1 counters. Click it again to take it back.',
    );
    expect(
      [BLIGHT_TITLE, blightPrompt(QUESTION, index()), blightDetail([], index())].join(' '),
    ).not.toMatch(/[Ss]acrifice/);
  });

  test('another choice of permanents is not worded as a blight', () => {
    const sacrifice = {
      purpose: 'sacrifice',
      min: 1,
      max: 1,
      legal: ['o1'],
      source: 'o9',
    } as never;
    expect(isBlight(sacrifice)).toBe(false);
    expect(angelsPermanentPrompt(sacrifice, index())).toBeNull();
    expect(choosePermanentPrompt(sacrifice, index())).not.toMatch(/blight/i);
  });
});

describe('the log line of a blight', () => {
  const state = {
    objects: {
      o1: { card: 'c1', token: null, stack: null, controller: 0 },
      o2: { card: null, token: null, stack: { kind: 'ability', source: 'o3' }, controller: 0 },
      o3: { card: 'c2', token: null, stack: null, controller: 0 },
    },
    cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
    definitions: { d1: { name: 'Giant Spider' }, d2: { name: 'Spiral into Solitude' } },
    lki: {},
    pending: null,
  } as unknown as GameState;
  const chosen = (automatic: boolean) => ({
    kind: 'permanentsChosen',
    seat: 0,
    source: 'o2',
    objects: ['o1'],
    purpose: 'blight',
    automatic,
  });

  test('who blights which creature, and that there was no other choice', () => {
    expect(describeEvent(chosen(false) as never, state, state, 0)?.text).toBe(
      "You blight Giant Spider to pay for Spiral into Solitude's ability.",
    );
    expect(describeEvent(chosen(true) as never, state, state, 0)?.text).toBe(
      "You must blight Giant Spider to pay for Spiral into Solitude's ability: no other choice.",
    );
  });
});

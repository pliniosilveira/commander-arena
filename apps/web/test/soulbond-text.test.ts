/**
 * The web side of D-984 (soulbond, CR 702.95) as pure models, no DOM: the words of the question that asks which creature to pair with, the log lines of a pairing and of a
 * pair that ended, the words of the two abilities soulbond stands for (the effect and the intervening "if") and of the condition "paired", and the guard that no other
 * choice of permanents is worded as a pairing and a pairing is never worded as a sacrifice. The cards are the engine's SYNTHETIC fixtures (`synthetic-soulbond.ts`).
 */
import type {
  ChoosePermanentDecision,
  GameState,
  ObjectView,
  StackAbility,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvent } from '../src/game/describe';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { choosePermanentPrompt, permanentsDetail } from '../src/ui/decisions/permanents';
import { angelsBadge, angelsPermanentPrompt } from '../src/ui/decisions/permanents-angels';
import {
  isSoulbond,
  SOULBOND_BADGE,
  SOULBOND_TITLE,
  soulbondConfirm,
  soulbondDetail,
  soulbondPrompt,
} from '../src/ui/decisions/permanents-soulbond';

const objectView = (id: string, name: string, extra: Partial<ObjectView> = {}): ObjectView =>
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
  purpose: 'soulbond',
  source: 'o9',
  subject: 'o5',
  min: 0,
  max: 1,
  legal: ['o1', 'o2'],
} as unknown as ChoosePermanentDecision;

const index = new Map<`o${number}`, ObjectView>([
  ['o1', objectView('o1', 'Grizzly Bears')],
  ['o5', objectView('o5', 'SYNTHETIC Soulbound Squire')],
  ['o9', objectView('o9', 'SYNTHETIC Soulbound Squire', { zone: 'stack' })],
]);

test('the question names the creature with soulbond, says "or none", and its title, badge and Confirm are about pairing', () => {
  expect(isSoulbond(QUESTION)).toBe(true);
  expect(soulbondPrompt(QUESTION, index)).toBe(
    'Pair SYNTHETIC Soulbound Squire with another unpaired creature you control, or none.',
  );
  expect(angelsPermanentPrompt(QUESTION, index)).toBe(soulbondPrompt(QUESTION, index));
  expect(angelsBadge(QUESTION, index)).toBe(SOULBOND_BADGE);
  expect(SOULBOND_TITLE).toBe('Pair a creature');
  expect(soulbondConfirm([])).toBe("Don't pair");
  expect(soulbondConfirm(['o1'])).toBe('Pair them');
});

test('the bar says what a click does and names the creature chosen', () => {
  expect(soulbondDetail([], index)).toBe('Click a creature to pair it, or Confirm to pair none.');
  expect(soulbondDetail(['o1'], index)).toBe(
    'Grizzly Bears will be paired. Click it again to take it back.',
  );
});

test('no word of the question is a sacrifice, and a sacrifice is not worded as a pairing', () => {
  const words = [
    soulbondPrompt(QUESTION, index),
    SOULBOND_TITLE,
    soulbondConfirm([]),
    soulbondDetail([], index),
  ].join(' ');
  expect(words).not.toMatch(/[Ss]acrifice/);
  const sacrifice = { purpose: 'sacrifice', min: 1, max: 1, legal: ['o1'], source: 'o9' } as never;
  expect(permanentsDetail([], { purpose: 'sacrifice', min: 1 })).not.toMatch(/pair/i);
  expect(choosePermanentPrompt(sacrifice, index)).not.toMatch(/pair/i);
  expect(angelsPermanentPrompt(sacrifice, index)).toBeNull();
});

const state = (names: Record<string, string>) =>
  ({
    objects: {},
    lki: Object.fromEntries(
      Object.entries(names).map(([id, name]) => [id, { characteristics: { name } }]),
    ),
    stack: [],
    pending: null,
  }) as unknown as GameState;

test('the log: a pairing and each way a pair ends', () => {
  const s = state({ o1: 'Grizzly Bears', o2: 'SYNTHETIC Soulbound Squire' });
  expect(
    describeEvent({ kind: 'creaturesPaired', a: 'o2', b: 'o1', by: 0 } as never, s, s, 0)?.text,
  ).toBe('You pair SYNTHETIC Soulbound Squire with Grizzly Bears.');
  expect(
    describeEvent({ kind: 'creaturesPaired', a: 'o2', b: 'o1', by: 1 } as never, s, s, 0)?.text,
  ).toBe('Opponent pairs SYNTHETIC Soulbound Squire with Grizzly Bears.');
  expect(
    describeEvent({ kind: 'creaturesPaired', a: 'o2', b: 'o1', by: 0 } as never, s, s, 0)?.rule,
  ).toBe('CR 702.95a');
  const ended = (why: string) =>
    describeEvent({ kind: 'creaturesUnpaired', a: 'o1', b: 'o2', why } as never, s, s, 0);
  expect(ended('left')?.text).toBe(
    'Grizzly Bears is no longer paired: its partner left the battlefield.',
  );
  expect(ended('control')?.text).toBe(
    'Grizzly Bears is no longer paired: control of one of the two changed.',
  );
  expect(ended('notCreature')?.text).toBe(
    'Grizzly Bears is no longer paired: one of the two stopped being a creature.',
  );
  expect(ended('left')?.rule).toBe('CR 702.95e');
});

test('the condition "paired" and the intervening "if" of soulbond are worded, and negated', () => {
  expect(gameConditionWords({ kind: 'paired' })).toBe(
    'this creature is paired with another creature',
  );
  expect(gameConditionWords({ kind: 'not', term: { kind: 'paired' } })).toBe(
    "this creature isn't paired with another creature",
  );
  expect(gameConditionWords({ kind: 'soulbondReady', with: 'another' })).toBe(
    'you control both this creature and another creature and both are unpaired',
  );
  expect(gameConditionWords({ kind: 'soulbondReady', with: 'triggerSubject' })).toBe(
    'you control both that creature and this one and both are unpaired',
  );
});

test('the stack: the two abilities soulbond stands for say what they do and their "if"', () => {
  const enters = {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    interveningIf: { kind: 'soulbondReady', with: 'another' },
    effect: { kind: 'pair', partner: 'choose' },
  } as unknown as StackAbility;
  const other = {
    kind: 'triggered',
    trigger: {
      kind: 'entersBattlefield',
      what: { types: ['creature'], controller: 'you', other: true },
    },
    interveningIf: { kind: 'soulbondReady', with: 'triggerSubject' },
    effect: { kind: 'pair', partner: 'triggerSubject' },
  } as unknown as StackAbility;
  const a = triggerGist(enters, undefined);
  expect(a).toMatch(/pair this creature with another unpaired creature you control/i);
  expect(a).toMatch(/if you control both this creature and another creature and both are unpaired/);
  const b = triggerGist(other, undefined);
  expect(b).toMatch(/pair this creature with the creature that entered/i);
  expect(b).toMatch(/if you control both that creature and this one and both are unpaired/);
  expect(a + b).not.toMatch(/undefined|null|\[object|"kind"|NaN/);
});

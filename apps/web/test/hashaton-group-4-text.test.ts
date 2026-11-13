/**
 * The web side of group 4 of the Hashaton deck (D-1120, D-1122 to D-1124) as pure models, no DOM: the words of the keyword action amass (the line of the stack and the spell),
 * the words of the question that asks which Army creature gets the counters and its badge, and the guard that no other choice of permanents is worded as amass.
 */
import type { ChoosePermanentDecision, ObjectView, StackAbility } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { lordWordings } from '../src/game/static-text';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { choosePermanentPrompt, permanentsDetail } from '../src/ui/decisions/permanents';
import {
  AMASS_BADGE,
  AMASS_TITLE,
  amassDetail,
  amassPrompt,
  isAmass,
} from '../src/ui/decisions/permanents-amass';
import { angelsBadge, angelsPermanentPrompt } from '../src/ui/decisions/permanents-angels';

const objectView = (id: string, name: string, extra: Partial<ObjectView> = {}): ObjectView =>
  ({
    id,
    name,
    types: ['creature'],
    subtypes: ['Army'],
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
  purpose: 'amass',
  source: 'o9',
  min: 1,
  max: 1,
  legal: ['o1', 'o2'],
} as unknown as ChoosePermanentDecision;

const index = new Map<`o${number}`, ObjectView>([
  ['o1', objectView('o1', 'Orc Army')],
  ['o2', objectView('o2', 'Zombie Army', { isToken: true })],
  ['o9', objectView('o9', 'Gleaming Overseer', { zone: 'stack' })],
]);

const trigger = (effect: unknown): StackAbility =>
  ({
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    effect,
  }) as unknown as StackAbility;

test('the question names the spell or ability and asks for an Army creature; the badge says what the choice gets', () => {
  expect(isAmass(QUESTION)).toBe(true);
  expect(amassPrompt(QUESTION, index)).toBe(
    'Amass: choose an Army you control to put the +1/+1 counters on (Gleaming Overseer).',
  );
  expect(angelsPermanentPrompt(QUESTION, index)).toBe(amassPrompt(QUESTION, index));
  expect(angelsBadge(QUESTION, index)).toBe(AMASS_BADGE);
});

test('the bar says what a click does and names the Army chosen; none of its words is a sacrifice', () => {
  expect(amassDetail([], index)).toMatch(/^Click an Army to put the \+1\/\+1 counters on it/);
  expect(amassDetail(['o2'], index)).toBe(
    'Zombie Army will get the +1/+1 counters. Click it again to take it back.',
  );
  expect([AMASS_TITLE, amassDetail([], index), amassDetail(['o1'], index)].join(' ')).not.toMatch(
    /[Ss]acrifice/,
  );
});

test('another choice of permanents is not worded as amass, and amass is not worded as a sacrifice', () => {
  const sacrifice = { purpose: 'sacrifice', min: 1, max: 1, legal: ['o1'], source: 'o9' } as never;
  expect(isAmass(sacrifice)).toBe(false);
  expect(angelsPermanentPrompt(sacrifice, index)).toBeNull();
  expect(choosePermanentPrompt(sacrifice, index)).not.toMatch(/amass/i);
  expect(permanentsDetail([], { purpose: 'sacrifice', min: 1 })).not.toMatch(/amass/i);
  expect(amassPrompt(QUESTION, index)).not.toMatch(/[Ss]acrifice/);
});

test('the effect is worded as the cards print it, with the plural of the creature type', () => {
  expect(triggerGist(trigger({ kind: 'amass', subtype: 'Zombie', count: 1 }), undefined)).toBe(
    'Amass Zombies 1',
  );
  expect(triggerGist(trigger({ kind: 'amass', subtype: 'Orc', count: 3 }), undefined)).toBe(
    'Amass Orcs 3',
  );
  expect(triggerGist(trigger({ kind: 'amass', subtype: 'Elf', count: 2 }), undefined)).toBe(
    'Amass Elves 2',
  );
  const words = triggerGist(
    trigger({ kind: 'amass', subtype: 'Zombie', count: { kind: 'x' } }),
    undefined,
  );
  expect(words).toMatch(/^Amass Zombies /);
  expect(words).not.toMatch(/undefined|null|\[object|"kind"|NaN/);
});

test('the static of the Overseer is worded: a group of tokens of one creature type, with both keywords', () => {
  const grant = (keyword: string, filter: object) =>
    ({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'filter', filter },
        keyword: { kind: keyword },
      },
    }) as never;
  const zombies = { subtypes: ['Zombie'], token: true, controller: 'you' };
  const words = lordWordings([grant('hexproof', zombies), grant('menace', zombies)], {
    noun: 'creature',
  });
  expect(words.join(' ')).toMatch(/Zombie tokens you control/);
  expect(words.join(' ')).toMatch(/hexproof/);
  expect(words.join(' ')).toMatch(/menace/);
  expect(words.join(' ')).not.toMatch(/undefined|null|\[object|"kind"|NaN/);
  // Another group of tokens keeps its name; a filter the words cannot say is left out, never guessed.
  expect(
    lordWordings([grant('haste', { types: ['creature'], token: true, controller: 'you' })], {
      noun: 'creature',
    }).join(' '),
  ).toMatch(/Creature tokens you control/);
  expect(
    lordWordings([grant('haste', { token: true, controller: 'you', other: true })], {
      noun: 'creature',
    }),
  ).toEqual([]);
});

/** Saga words (CR 714): numerals, the lore badge, the chapter label and the log lines, from fake states. */
import type { GameState, ObjectId, ObjectView } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { chapterWord, loreBadge, loreCountIn, romanNumeral, stackLabel } from '../src/game/saga';
import { counterChips } from '../src/ui/board/resolve';
import { stackName } from '../src/ui/decisions/lookup';

const RITE = 'SYNTHETIC Rite of Three';

/** o1 is a Saga with two lore counters, o2 a Bears with a lore counter, o3 a chapter ability of o1. */
const state = (chapter?: number) =>
  ({
    objects: {
      o1: { card: 'c1', token: null, stack: null, controller: 0, face: 0, counters: { lore: 2 } },
      o2: { card: 'c2', token: null, stack: null, controller: 0, face: 0, counters: { lore: 1 } },
      o3: {
        card: null,
        token: null,
        controller: 0,
        face: 0,
        counters: {},
        stack: { kind: 'ability', source: 'o1', ...(chapter === undefined ? {} : { chapter }) },
      },
    },
    cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
    definitions: {
      d1: { name: RITE, faces: [{ name: RITE, subtypes: ['Saga'] }] },
      d2: { name: 'Grizzly Bears', faces: [{ name: 'Grizzly Bears', subtypes: ['Bear'] }] },
    },
    lki: {},
    pending: null,
  }) as unknown as GameState;

const text = (event: object, s: GameState = state()) =>
  describeEvent(event as never, s, s, 0)?.text;

test('romanNumeral writes chapter numbers', () => {
  expect([1, 2, 3, 4, 5, 6, 8, 9, 10].map(romanNumeral)).toEqual([
    'I',
    'II',
    'III',
    'IV',
    'V',
    'VI',
    'VIII',
    'IX',
    'X',
  ]);
});

test('loreBadge reads "Lore N / M" only for a Saga with chapter abilities', () => {
  expect(loreBadge({ counters: { lore: 1 }, finalChapter: 3 })).toBe('Lore 1 / 3');
  expect(loreBadge({ counters: {}, finalChapter: 3 })).toBe('Lore 0 / 3');
  expect(loreBadge({ counters: { lore: 2 } })).toBeNull();
});

test('a Saga shows lore as the badge, not as a counter chip; other counters stay', () => {
  const saga = { counters: { lore: 1, '+1/+1': 2 }, finalChapter: 3 } as unknown as ObjectView;
  expect(counterChips(saga)).toEqual([{ name: '+1/+1', count: 2 }]);
  const plain = { counters: { lore: 1 } } as unknown as ObjectView;
  expect(counterChips(plain)).toEqual([{ name: 'lore', count: 1 }]);
});

test('the stack label of a chapter ability names the chapter; any other object keeps its name', () => {
  expect(chapterWord(2)).toBe('chapter II');
  expect(chapterWord(undefined)).toBeNull();
  expect(stackLabel({ name: RITE, chapter: 2 })).toBe(`${RITE} — chapter II`);
  expect(stackLabel({ name: 'Lightning Bolt' })).toBe('Lightning Bolt');
});

test('stackName says "chapter II ability" for a chapter ability and keeps "ability" for others', () => {
  const index = new Map<ObjectId, ObjectView>([
    ['o10', { name: RITE, abilitySource: 'o1', chapter: 2 } as unknown as ObjectView],
    ['o11', { name: 'Sol Ring', abilitySource: 'o9' } as unknown as ObjectView],
  ]);
  expect(stackName(index, 'o10')).toBe(`${RITE}'s chapter II ability`);
  expect(stackName(index, 'o11')).toBe("Sol Ring's ability");
});

test('loreCountIn is the lore counters of a Saga and null for anything else', () => {
  expect(loreCountIn(state(), 'o1')).toBe(2);
  expect(loreCountIn(state(), 'o2')).toBeNull();
  expect(loreCountIn(state(), 'o999')).toBeNull();
});

test('the lore counter line names the chapter the Saga is at', () => {
  expect(text({ kind: 'counterAdded', object: 'o1', counter: 'lore', count: 1 })).toBe(
    `A lore counter on ${RITE} (II).`,
  );
  expect(text({ kind: 'counterAdded', object: 'o1', counter: 'lore', count: 2 })).toBe(
    `2 lore counters on ${RITE} (II).`,
  );
});

test('a lore counter on a permanent that is not a Saga, and other counters, read as before', () => {
  expect(text({ kind: 'counterAdded', object: 'o2', counter: 'lore', count: 1 })).toBe(
    '1 lore counter on Grizzly Bears.',
  );
  expect(text({ kind: 'counterAdded', object: 'o1', counter: '+1/+1', count: 1 })).toBe(
    `1 +1/+1 counter on ${RITE}.`,
  );
});

test('the chapter trigger line names the chapter; an ordinary trigger is unchanged', () => {
  const trigger = {
    kind: 'abilityTriggered',
    seat: 0,
    source: 'o1',
    abilityIndex: 1,
    stackObject: 'o3',
  };
  expect(text({ ...trigger, chapter: 2 })).toBe(`${RITE}'s chapter II triggers.`);
  expect(text(trigger)).toBe(`${RITE} triggers.`);
});

test('a chapter ability on the stack is "<Saga>\'s chapter II ability" in the resolve line', () => {
  expect(text({ kind: 'resolved', object: 'o3' }, state(2))).toBe(
    `${RITE}'s chapter II ability resolves.`,
  );
  expect(text({ kind: 'resolved', object: 'o3' }, state())).toBe(`${RITE}'s ability resolves.`);
});

test('the Saga sacrifice keeps the generic sacrifice line: the event carries no reason', () => {
  expect(text({ kind: 'sacrificed', permanent: 'o1', controller: 0 })).toBe(
    `You sacrifice ${RITE}.`,
  );
});

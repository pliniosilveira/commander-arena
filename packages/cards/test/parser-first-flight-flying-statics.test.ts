// The First Flight starter Commander decks, the group of statics that name "with flying" or "without flying" (D-149): the Oracle lines of Empyrean Eagle, Favorable
// Winds, Gravitational Shift, Thunderclap Wyvern and Skycat Sovereign (the real ability lines, as the issue gave them; the cards are not in the golden corpus yet), and
// SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-first-flight-flying-statics.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { readAll as readAllFace, read as readFace } from './parser-p5-helpers';

const read = (text: string, type: Parameters<typeof readFace>[1] = 'creature') =>
  readFace(text, type);

const readAll = (text: string, type: Parameters<typeof readAllFace>[1] = 'creature') =>
  readAllFace(text, type);

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const flyers = (extra: object = {}) => ({
  kind: 'filter',
  filter: { types: ['creature'], keywords: ['flying'], ...extra },
});

describe('"Other creatures you control with flying get +1/+1." (Empyrean Eagle, Thunderclap Wyvern; CR 613.4c, 613.8)', () => {
  test('the real line: the other flyers of the controller get the bonus', () => {
    const parsed = read('Other creatures you control with flying get +1/+1.');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { ...flyers({ controller: 'you' }), other: true },
          power: 1,
          toughness: 1,
        },
      },
    ]);
  });

  test('another bonus (SYNTHETIC)', () => {
    expect(read('Other creatures you control with flying get +2/+1.').abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { ...flyers({ controller: 'you' }), other: true },
          power: 2,
          toughness: 1,
        },
      },
    ]);
  });

  test.each([
    'Other creatures you control with flying get +1/+1',
    'Other creatures you control with flying gets +1/+1.',
    'Other creatures you control with flying get +X/+X.',
    'Other creatures you control with flying get +1/+1 until end of turn.',
    'Other creatures you control with flying have base power and toughness 1/1.',
  ])('near miss: %s', (text) => NOT_READ(text));
});

describe('"Creatures you control with flying get +1/+1." (Favorable Winds; CR 613.4c, 613.8)', () => {
  test('the real line: every flyer of the controller, the source included', () => {
    const parsed = read('Creatures you control with flying get +1/+1.', 'enchantment');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: flyers({ controller: 'you' }),
          power: 1,
          toughness: 1,
        },
      },
    ]);
  });

  test.each([
    'Creatures you control with flying get +1/+1',
    'Creatures you control with flying gets +1/+1.',
    'Creatures you control with flying have base power and toughness 1/1.',
  ])('near miss: %s', (text) => NOT_READ(text, 'enchantment'));
});

describe('"Creatures with flying get +2/+0." and "Creatures without flying get -2/-0." (Gravitational Shift; CR 613.4c)', () => {
  test('the real lines: the creatures of every player, by the keyword they have or lack', () => {
    const parsed = readAll(
      'Creatures with flying get +2/+0.\nCreatures without flying get -2/-0.',
      'enchantment',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: flyers(), power: 2, toughness: 0 },
      },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: { types: ['creature'], notKeywords: ['flying'] } },
          power: -2,
          toughness: 0,
        },
      },
    ]);
  });

  test.each([
    'Creatures with flying get +2/+0',
    'Creatures without flying get -2/-0 until end of turn.',
    'Creatures without flying have base power and toughness 0/1.',
  ])('near miss: %s', (text) => NOT_READ(text, 'enchantment'));
});

describe('"This creature gets +1/+1 for each other creature you control with flying." (Skycat Sovereign; CR 611.3a, 613.4c)', () => {
  const count = {
    kind: 'countOf',
    filter: { types: ['creature'], keywords: ['flying'], other: true, controller: 'you' },
  };

  test('the real line: a bonus for each other flyer the controller has', () => {
    const parsed = read(
      'This creature gets +1/+1 for each other creature you control with flying.',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: { kind: 'this' }, power: count, toughness: count },
      },
    ]);
  });

  test('a multiple of the count (SYNTHETIC)', () => {
    const parsed = read(
      'This creature gets +2/+0 for each other creature you control with flying.',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'this' },
          power: { kind: 'times', factor: 2, of: count },
          toughness: 0,
        },
      },
    ]);
  });

  test.each([
    // a characteristic-defining ability (layer 7a) cannot read layer 6
    "This creature's power and toughness are each equal to the number of creatures you control with flying.",
    // the objects of another player are not counted by a static ability
    'This creature gets +1/+1 for each creature your opponents control with flying.',
    'This creature gets +1/+1 for each other creature you control with flying',
    'This creature gets +1/+1 for each other creature you control with flying until end of turn.',
  ])('near miss: %s', (text) => NOT_READ(text));
});

describe('a keyword in the subject of a line that is neither a keyword nor a "+N/+N" is still refused (CR 613.8)', () => {
  test.each([
    'Creatures you control with flying have base power and toughness 1/1.',
    'Creatures you control with flying lose all abilities.',
    'Creatures you control with flying are blue.',
  ])('%s', (text) => NOT_READ(text, 'enchantment'));
});

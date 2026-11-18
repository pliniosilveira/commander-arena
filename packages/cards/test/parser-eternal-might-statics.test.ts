// The Eternal Might deck (issue 104), the group of static and continuous effects: the lines of On Wings of Gold, Maskwood Nexus and Rhet-Tomb Mystic. The first line of each
// block is the real Oracle text of the acceptance card of the golden corpus; the others are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs
// what is lowered in convert-grammar-engine-eternal-might-statics.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read as readFace } from './parser-p5-helpers';

const read = (text: string, type: Parameters<typeof readFace>[1] = 'creature') =>
  readFace(text, type);

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const group = (subtype: string) => ({
  kind: 'filter',
  filter: {
    types: ['creature'],
    controller: 'you',
    anyOf: [{ subtypes: [subtype] }, { token: true }],
  },
});

describe('On Wings of Gold: "Creatures you control that are Zombies and/or tokens get +1/+1 and have flying." (CR 205.3m, 111.1, 611.3a)', () => {
  test('the real line: a creature type or a token, a bonus and a keyword', () => {
    const parsed = read(
      'Creatures you control that are Zombies and/or tokens get +1/+1 and have flying.',
      'enchantment',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: group('Zombie'), power: 1, toughness: 1 },
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: group('Zombie'), keyword: { kind: 'flying' } },
      },
    ]);
  });

  test('another creature type (SYNTHETIC)', () => {
    expect(
      read('Creatures you control that are Elves and/or tokens have vigilance.', 'enchantment')
        .abilities,
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: group('Elf'), keyword: { kind: 'vigilance' } },
      },
    ]);
  });

  test.each([
    'Creatures you control that are Zombies or tokens get +1/+1.',
    'Creatures you control that are Zombies and tokens get +1/+1.',
    'Creatures you control that are Zombies and/or tokens get +1/+1',
    'Other creatures you control that are Zombies and/or tokens get +1/+1.',
    'Creatures your opponents control that are Zombies and/or tokens get +1/+1.',
    'Creatures you control that are Bananas and/or tokens get +1/+1.',
  ])('near miss: %s', (text) => NOT_READ(text, 'enchantment'));
});

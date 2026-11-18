// The Eternal Might deck (issue 104), the group of static and continuous effects: the lines of On Wings of Gold, Maskwood Nexus and Rhet-Tomb Mystic. The first line of each
// block is the real Oracle text of the acceptance card of the golden corpus; the others are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs
// what is lowered in convert-grammar-engine-eternal-might-statics.test.ts.
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

const EVERY_TYPE =
  "Creatures you control are every creature type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.";

describe('Maskwood Nexus: "Creatures you control are every creature type. The same is true for ..." (CR 205.3m, 613.1d, 604.3)', () => {
  test('the real text: one effect for each scope the statement names', () => {
    const parsed = read(EVERY_TYPE, 'artifact');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      { kind: 'static', static: { kind: 'allCreatureTypes', scope: 'youControl' } },
      { kind: 'static', static: { kind: 'allCreatureTypes', scope: 'youOwn' } },
    ]);
  });

  test.each([
    'Creatures you control are every creature type.',
    EVERY_TYPE.replace('Creatures you control are', 'Other creatures you control are'),
    EVERY_TYPE.replace('Creatures you control are', 'Zombies you control are'),
    EVERY_TYPE.replace('creature spells you control', 'creature spells you cast'),
    EVERY_TYPE.replace("aren't on", 'are on'),
    EVERY_TYPE.replace(
      'every creature type',
      'every creature type in addition to their other types',
    ),
  ])('near miss: %s', (text) => NOT_READ(text, 'artifact'));
});

describe('Rhet-Tomb Mystic: "Each creature card in your hand has cycling {1}{U}." (CR 702.29a, 613.1f, 611.3a)', () => {
  const given = (types: string[], symbols: string[]) => ({
    kind: 'static',
    static: {
      kind: 'grantKeywordToHandCards',
      what: { types },
      keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols }] },
    },
  });

  test('the real text: the creature cards of the hand have cycling with the cost', () => {
    const parsed = read('Each creature card in your hand has cycling {1}{U}.');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([given(['creature'], ['1', 'U'])]);
  });

  test('flying first, as the card prints them', () => {
    const parsed = readAll('Flying\nEach creature card in your hand has cycling {1}{U}.');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      given(['creature'], ['1', 'U']),
    ]);
  });

  test('other card types and costs (SYNTHETIC)', () => {
    expect(read('Each artifact creature card in your hand has cycling {2}.').abilities).toEqual([
      given(['artifact', 'creature'], ['2']),
    ]);
    expect(read('Each land card in your hand has cycling {W}.', 'enchantment').abilities).toEqual([
      given(['land'], ['W']),
    ]);
  });

  test.each([
    'Each creature card in your hand has cycling {1}{U}',
    'Each creature card in a hand has cycling {1}{U}.',
    'Each creature card in your graveyard has cycling {1}{U}.',
    'Each creature card in your hand has flying.',
    'Each creature card in your hand has cycling {X}.',
    'Each creature card in your hand has cycling {W/U}.',
    'Each creature card in your hand has cycling—Pay 2 life.',
    'Each creature card in your hand has cycling {1}{U} and flying.',
    'Each card in your hand has cycling {1}{U}.',
  ])('near miss: %s', (text) => NOT_READ(text));
});

describe('Maskwood Nexus: "Create a 2/2 blue Shapeshifter creature token with changeling." (CR 702.73a, 111.3)', () => {
  const token = (keywords: object[]) => ({
    kind: 'createToken',
    token: {
      kind: 'custom',
      definition: {
        name: 'Shapeshifter',
        manaCost: null,
        supertypes: [],
        types: ['creature'],
        subtypes: ['Shapeshifter'],
        colors: ['U'],
        power: 2,
        toughness: 2,
        loyalty: null,
        defense: null,
        oracleText: '',
        abilities: keywords.map((keyword) => ({ kind: 'keyword', keyword })),
      },
    },
    count: 1,
  });

  test('the real text: the token has the keyword changeling as its own ability', () => {
    const parsed = read(
      '{3}, {T}: Create a 2/2 blue Shapeshifter creature token with changeling.',
      'artifact',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['3'] }, { kind: 'tap' }],
        effect: token([{ kind: 'changeling' }]),
      },
    ]);
  });

  test('with a keyword that can be granted (SYNTHETIC)', () => {
    const parsed = read(
      '{3}, {T}: Create a 2/2 blue Shapeshifter creature token with flying and changeling.',
      'artifact',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['3'] }, { kind: 'tap' }],
        effect: token([{ kind: 'flying' }, { kind: 'changeling' }]),
      },
    ]);
  });

  test.each([
    '{3}, {T}: Create a 2/2 blue Shapeshifter creature token with changeling and changeling.',
    '{3}, {T}: Create a 2/2 blue Shapeshifter creature token with flash.',
  ])('near miss: %s', (text) => NOT_READ(text, 'artifact'));
});

// Stage P20 (M6): power and toughness from counts and X (D-109, D-115; ENGINE_VERSION 20). Each line is read
// through the whole pipeline and compared with the engine AST it must produce; each near miss says where it
// stops or why it is dropped. The lines of reports/template-replay.md (the owner's run) are the real ones:
// "~ gets +1/+0 for each artifact you control.", "Equipped creature gets +1/+1 for each land you control.",
// "~'s power and toughness are each equal to the number of lands you control.", "~'s power is equal to the
// number of creatures you control.", "All creatures get -X/-X until end of turn." and "{X}{R}{G}, {T}: Target
// creature gets +X/+0 and gains trample until end of turn."; every other line is SYNTHETIC, and no real card is
// marked supported here. That the engine runs what is lowered is in convert-grammar-engine-p20.test.ts; that a
// missing engine feature is named is in parser-p20-needs.test.ts.
import type { Ability, Effect, ObjectFilter } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const X = { kind: 'x' } as const;
const THIS = { kind: 'this' } as const;
const count = (filter: ObjectFilter) => ({ kind: 'countOf', filter }) as const;
const times = (factor: number, of: ReturnType<typeof count> | typeof X) =>
  ({ kind: 'times', factor, of }) as const;
const statics = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  readAll(text, type, subtypes).abilities.map((a: Ability) => (a.kind === 'static' ? a.static : a));
const effectOf = (text: string, type: FaceType = 'sorcery'): Effect | undefined =>
  readAll(text, type).spell?.effect;

describe('static.pt-count: "gets +N/+M for each ..." (CR 611.3a, 613.4c)', () => {
  const artifacts = count({ types: ['artifact'], controller: 'you' });

  test.each([
    [
      '~ gets +1/+0 for each artifact you control.',
      'creature',
      [],
      { kind: 'modifyPt', subject: THIS, power: artifacts, toughness: 0 },
    ],
    [
      '~ gets +0/+1 for each artifact you control.',
      'creature',
      [],
      { kind: 'modifyPt', subject: THIS, power: 0, toughness: artifacts },
    ],
    [
      '~ gets +1/+1 for each artifact you control.',
      'creature',
      [],
      { kind: 'modifyPt', subject: THIS, power: artifacts, toughness: artifacts },
    ],
    [
      'Equipped creature gets +1/+1 for each land you control.',
      'artifact',
      ['Equipment'],
      {
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'] },
        power: count({ types: ['land'], controller: 'you' }),
        toughness: count({ types: ['land'], controller: 'you' }),
      },
    ],
    [
      'Enchanted creature gets -1/-1 for each creature card in your graveyard.',
      'enchantment',
      ['Aura'],
      {
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'] },
        power: times(-1, count({ zone: 'graveyard', types: ['creature'], controller: 'you' })),
        toughness: times(-1, count({ zone: 'graveyard', types: ['creature'], controller: 'you' })),
      },
    ],
    [
      'Equipped creature gets +2/-1 for each Elf you control.',
      'artifact',
      ['Equipment'],
      {
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'] },
        power: times(2, count({ subtypes: ['Elf'], controller: 'you' })),
        toughness: times(-1, count({ subtypes: ['Elf'], controller: 'you' })),
      },
    ],
    [
      '~ gets +1/+1 for each other creature you control.',
      'creature',
      [],
      {
        kind: 'modifyPt',
        subject: THIS,
        power: count({ types: ['creature'], controller: 'you', other: true }),
        toughness: count({ types: ['creature'], controller: 'you', other: true }),
      },
    ],
    [
      'Other creatures you control get +1/+1 for each Elf you control.',
      'enchantment',
      [],
      {
        kind: 'modifyPt',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], controller: 'you' },
          other: true,
        },
        power: count({ subtypes: ['Elf'], controller: 'you' }),
        toughness: count({ subtypes: ['Elf'], controller: 'you' }),
      },
    ],
  ] as const)('%s', (text, type, subtypes, expected) => {
    expect(statics(text, type, subtypes)).toEqual([expected]);
  });

  test.each([
    '~ gets +1/+1 for each artifact you control',
    '~ gets +1/+1 for each burden counter on ~.',
    '~ gets +X/+X for each artifact you control.',
    '~ gets +0/+0 for each artifact you control.',
    '~ gets +1/+1 until end of turn for each artifact you control.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test.each([
    '~ gets +1/+1 for each creature you control with power 3 or greater.',
    '~ gets +1/+1 for each creature you control with toughness 2 or less.',
    '~ gets +1/+1 for each artifact your opponents control.',
  ])('"%s" is read and refused: the engine counts neither (CR 613.8)', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('static.defines-pt: a characteristic-defining ability (CR 604.3, 208.2a)', () => {
  const lands = count({ types: ['land'], controller: 'you' });

  test.each([
    [
      "~'s power and toughness are each equal to the number of lands you control.",
      { kind: 'characteristicPt', power: lands, toughness: lands },
    ],
    [
      "~'s power and toughness are each equal to the number of cards in your hand.",
      {
        kind: 'characteristicPt',
        power: count({ zone: 'hand', controller: 'you' }),
        toughness: count({ zone: 'hand', controller: 'you' }),
      },
    ],
    [
      "~'s power is equal to the number of creatures you control.",
      { kind: 'characteristicPt', power: count({ types: ['creature'], controller: 'you' }) },
    ],
    [
      "~'s toughness is equal to the number of creature cards in your graveyard.",
      {
        kind: 'characteristicPt',
        toughness: count({ zone: 'graveyard', types: ['creature'], controller: 'you' }),
      },
    ],
    [
      '~’s power and toughness are each equal to the number of Swamps you control.',
      {
        kind: 'characteristicPt',
        power: count({ subtypes: ['Swamp'], controller: 'you' }),
        toughness: count({ subtypes: ['Swamp'], controller: 'you' }),
      },
    ],
  ] as const)('%s', (text, expected) => {
    expect(statics(text)).toEqual([expected]);
  });

  test.each([
    "~'s power and toughness are each equal to twice the number of lands you control.",
    "~'s power and toughness are each equal to the number of lands you control plus 1.",
    "~'s power and toughness are each equal to its mana value.",
    "~'s power and toughness are each equal to the number of cards in target opponent’s hand.",
    "~'s power is equal to the number of creatures you control and its toughness is equal to the number of lands you control.",
    "Enchanted creature's power is equal to the number of lands you control.",
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test.each([
    "~'s power and toughness are each equal to the number of lands your opponents control.",
    "~'s power and toughness are each equal to the number of creatures you control with power 3 or greater.",
  ])('"%s" is read and refused', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('X and its sign in a pump (CR 107.3a, 611.2c)', () => {
  const END = 'untilEndOfTurn';
  const creatures = { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } };

  test.each([
    [
      'All creatures get -X/-X until end of turn.',
      { kind: 'modifyPt', objects: creatures, power: times(-1, X), toughness: times(-1, X) },
    ],
    [
      'Each creature gets -X/-X until end of turn.',
      { kind: 'modifyPt', objects: creatures, power: times(-1, X), toughness: times(-1, X) },
    ],
    [
      'All creatures get +1/+1 until end of turn.',
      { kind: 'modifyPt', objects: creatures, power: 1, toughness: 1 },
    ],
    [
      'Target creature gets +X/+0 until end of turn.',
      {
        kind: 'modifyPt',
        objects: { kind: 'target', id: 't1' },
        power: X,
        toughness: 0,
      },
    ],
    [
      'Target creature gets -X/-0 until end of turn.',
      {
        kind: 'modifyPt',
        objects: { kind: 'target', id: 't1' },
        power: times(-1, X),
        toughness: 0,
      },
    ],
    [
      'Target creature gets +X/+X until end of turn.',
      { kind: 'modifyPt', objects: { kind: 'target', id: 't1' }, power: X, toughness: X },
    ],
  ] as const)('%s', (text, expected) => {
    expect(effectOf(text)).toEqual({ ...expected, duration: END });
  });

  test('a spell that reads X says so, and the pump with a keyword keeps it', () => {
    const spell = readAll(
      'Target creature you control gets +X/+X and gains hexproof and indestructible until end of turn.',
      'instant',
    ).spell;
    expect(spell?.x).toBe(true);
    expect(spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'modifyPt', power: X, toughness: X },
        { kind: 'grantKeyword' },
        { kind: 'grantKeyword' },
      ],
    });
  });

  test('"{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn."', () => {
    const [ability] = readAll(
      '{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'modifyPt', power: X, toughness: 0 }, { kind: 'grantKeyword' }],
      },
    });
  });

  test.each([
    ['When ~ enters, each creature gets -X/-X until end of turn.', 'creature'],
    ['{R}: ~ gets +X/+0 until end of turn.', 'creature'],
    ['Creatures you control get +X/+X.', 'enchantment'],
  ] as const)(
    '"%s" is refused: X is announced by a spell or an ability cost only (CR 107.3j)',
    (text, type) => {
      expect(dropped(text, type).reason).toMatch(/notRunnable|unrecognised/);
    },
  );

  test.each([
    'Target creature gets +Y/+Y until end of turn.',
    'All creatures get -X/-X.',
    'All creatures gets -X/-X until end of turn.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

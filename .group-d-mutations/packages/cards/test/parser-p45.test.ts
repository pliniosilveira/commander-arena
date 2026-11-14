// Stage P45 (M61): the Ring tempts you and the rest of There and Back Again, read by the grammar (D-197; the engine's `ringTempts`, `ringTempted`,
// `controlsRingBearer` and the duration "for as long as you control this" of `restrict`, D-196, ENGINE_VERSION 47). The first tests are the real Oracle
// text of There and Back Again (the owner's request file of 2026-10-29), the name replaced by ~, with the nodes the grammar produces; the others read lines
// that say the same things over other words and the lines a rule must not read (flagged, never half run). Every sibling and refused line is SYNTHETIC.
// The engine runs what is lowered in convert-grammar-engine-p45.test.ts; a missing engine feature is named in parser-p45-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const T1 = { kind: 'target', id: 't1' };
const spell = (text: string) => readAll(text, 'sorcery').spell;
const ability = (text: string) => readAll(text, 'creature').abilities[0];

describe('the real chapters read as the engine runs them (D-196, D-197)', () => {
  test("chapter I: up to one target creature can't block for as long as you control the Saga, and the Ring tempts you", () => {
    const parsed = readAll(
      "I — Up to one target creature can't block for as long as you control ~. The Ring tempts you.",
      'enchantment',
      ['Saga'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'chapter', from: 1, to: 1 },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'restrict',
              objects: T1,
              restriction: 'cantBlock',
              duration: 'forAsLongAsYouControlThis',
            },
            { kind: 'ringTempts' },
          ],
        },
      },
    ]);
  });

  test('chapter III: Smaug, a legendary 6/6 red Dragon creature token with flying, haste and its own death trigger', () => {
    const parsed = readAll(
      'III — Create Smaug, a legendary 6/6 red Dragon creature token with flying, haste, and "When Smaug dies, create fourteen Treasure tokens."',
      'enchantment',
      ['Saga'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'chapter', from: 3, to: 3 },
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Smaug',
              manaCost: null,
              supertypes: ['legendary'],
              types: ['creature'],
              subtypes: ['Dragon'],
              colors: ['R'],
              power: 6,
              toughness: 6,
              loyalty: null,
              defense: null,
              oracleText: 'Flying, haste\nWhen Smaug dies, create fourteen Treasure tokens.',
              abilities: [
                { kind: 'keyword', keyword: { kind: 'flying' } },
                { kind: 'keyword', keyword: { kind: 'haste' } },
                {
                  kind: 'triggered',
                  trigger: { kind: 'dies', what: { kind: 'this' } },
                  effect: {
                    kind: 'createToken',
                    token: { kind: 'preset', preset: 'Treasure' },
                    count: 14,
                  },
                },
              ],
            },
          },
        },
      },
    ]);
  });
});

describe('"The Ring tempts you." (CR 701.54a)', () => {
  test('a spell', () => {
    expect(spell('The Ring tempts you.')).toEqual({ effect: { kind: 'ringTempts' } });
  });

  test('after another sentence', () => {
    expect(spell('Draw a card. The Ring tempts you.')?.effect).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'draw', player: { kind: 'you' }, count: 1 }, { kind: 'ringTempts' }],
    });
  });

  test.each([
    'The Ring tempts target player.',
    'The Ring tempts each opponent.',
    'The Ring tempts you twice.',
  ])('%s is not read', (text) => {
    expect(dropped(text, 'sorcery').closestRule).toBeDefined();
  });
});

describe('"Whenever the Ring tempts you" (CR 701.54d)', () => {
  test('a triggered ability', () => {
    expect(ability('Whenever the Ring tempts you, draw a card.')).toEqual({
      kind: 'triggered',
      trigger: { kind: 'ringTempted' },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
  });

  test.each([
    'Whenever the Ring tempts an opponent, draw a card.',
    'Whenever the Ring tempts a player, draw a card.',
  ])('%s is not read', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });
});

describe('"if you control your Ring-bearer" (CR 701.54e)', () => {
  test('the intervening "if" of a triggered ability', () => {
    expect(ability('Whenever ~ attacks, if you control your Ring-bearer, draw a card.')).toEqual({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      interveningIf: { kind: 'controlsRingBearer' },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
  });

  test.each([
    "Whenever ~ attacks, if you don't control your Ring-bearer, draw a card.",
    'Whenever ~ attacks, if you control a Ring-bearer, draw a card.',
    'Whenever ~ attacks, if an opponent controls their Ring-bearer, draw a card.',
  ])('%s is not read', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });
});

describe('"... for as long as you control ~" with a restriction (CR 611.2b)', () => {
  test.each([
    ["can't block", 'cantBlock'],
    ["can't be blocked", 'cantBeBlocked'],
  ])('a target creature %s', (words, restriction) => {
    expect(
      ability(`When ~ enters, target creature ${words} for as long as you control ~.`),
    ).toMatchObject({
      effect: {
        kind: 'restrict',
        objects: T1,
        restriction,
        duration: 'forAsLongAsYouControlThis',
      },
    });
  });

  test('"this turn" is still until end of turn', () => {
    expect(spell("Target creature can't block this turn.")?.effect).toEqual({
      kind: 'restrict',
      objects: T1,
      restriction: 'cantBlock',
      duration: 'untilEndOfTurn',
    });
  });

  test.each([
    "Target creature can't block for as long as you control a Dragon.",
    "Target creature can't block for as long as ~ remains tapped.",
    "Target creatures can't block for as long as you control ~.",
    "Up to two target creatures can't block for as long as you control ~.",
    "Target creature can't attack for as long as you control ~.",
  ])('%s is not read', (text) => {
    expect(dropped(text, 'enchantment').reason).toBeDefined();
  });
});

describe('a token with a name of its own (CR 111.4, 205.4)', () => {
  const make = (token: string) =>
    (spell(`Create ${token}.`)?.effect as { token?: { definition?: unknown } } | undefined)?.token
      ?.definition;

  test('legendary, with no abilities', () => {
    expect(make('Hero, a legendary 2/2 white Soldier creature token')).toMatchObject({
      name: 'Hero',
      supertypes: ['legendary'],
      subtypes: ['Soldier'],
      power: 2,
      toughness: 2,
      abilities: [],
    });
  });

  test('with one keyword, and with a keyword and an ability in quotes', () => {
    expect(make('Hero, a legendary 2/2 white Soldier creature token with flying')).toMatchObject({
      abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
    });
    expect(
      make(
        'Hero, a legendary 2/2 white Soldier creature token with flying and "When Hero dies, you gain 1 life."',
      ),
    ).toMatchObject({
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'triggered', trigger: { kind: 'dies', what: { kind: 'this' } } },
      ],
    });
  });

  test('the shared "with A, B, and \\"...\\"" shape reads for a token with no name too', () => {
    expect(
      make(
        'a 2/2 white Soldier creature token with flying, haste, and "When ~ dies, you gain 1 life."',
      ),
    ).toMatchObject({
      name: 'Soldier',
      supertypes: [],
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'keyword', keyword: { kind: 'haste' } },
        { kind: 'triggered' },
      ],
    });
  });

  test.each([
    'Hero, a 2/2 white Soldier creature token',
    'Hero, two legendary 2/2 white Soldier creature tokens',
    'Hero, a legendary 2/2 white Soldier creature token with flash',
    'Hero, a legendary 2/2 white Soldier creature token with flying, haste and "When Hero dies, you gain 1 life."',
    'Hero, a legendary 2/2 white Soldier creature token with flying, flying, and "When Hero dies, you gain 1 life."',
  ])('%s is not read', (token) => {
    expect(dropped(`Create ${token}.`, 'sorcery').reason).toBeDefined();
  });
});

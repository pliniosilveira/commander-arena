// What validateCard accepts and refuses about amounts in power and toughness (D-109, D-115): the amount of a
// "gets +N/+N" or "has base power and toughness" effect, a static "+N/+N", and a characteristic-defining
// ability with the printed "*" it needs. Pins: CR 107.3a and 107.3j (an X belongs to a spell or ability
// that announces one), CR 208.2 and 208.2a (a printed "*" is defined by an ability), CR 604.3 (a
// characteristic-defining ability), CR 611.2c (an effect's amount is read once), CR 611.3a (a static one
// follows the board), CR 613.8 (nothing a static count reads may depend on power or toughness).
// Cards are SYNTHETIC probes built here.
import { describe, expect, test } from 'vitest';
import { unsupportedFeatureIssues } from '../src/ast/supported';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { PtValue } from '../src/characteristics';
import {
  type Ability,
  type CardDefinition,
  type Effect,
  isFeatureSupported,
  type PtAmount,
  type StaticEffect,
  SUPPORTED_FEATURES,
  syntheticCard,
  validateCard,
} from '../src/index';

const X = { kind: 'x' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const END = 'untilEndOfTurn' as const;
const CREATURES = { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } } as const;
const HAND = { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } } as const;

const issues = (card: CardDefinition): string[] =>
  validateCard(card).map((i) => `${i.path}: ${i.message}`);

function expectIssue(found: readonly string[], fragment: string): void {
  expect(
    found.some((m) => m.includes(fragment)),
    `${fragment} in ${found.join(' | ')}`,
  ).toBe(true);
}

const spell = (effect: Effect, withX = true): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Pt Probe Spell',
    manaCost: withX ? ['X', 'G'] : ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'SYNTHETIC probe',
    spell: {
      ...(withX ? { x: true as const } : {}),
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect,
    },
  });

const pump = (power: PtAmount, toughness: PtAmount = 0): Effect => ({
  kind: 'modifyPt',
  objects: T1,
  power,
  toughness,
  duration: END,
});

const creature = (
  abilities: readonly Ability[],
  print: { power: PtValue; toughness: PtValue } = { power: 1, toughness: 1 },
): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Pt Probe Creature',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: [],
    colorIdentity: [],
    power: print.power,
    toughness: print.toughness,
    oracleText: 'SYNTHETIC probe',
    abilities,
  });

const stat = (effect: StaticEffect): Ability => ({ kind: 'static', static: effect });
const bonus = (power: unknown, toughness: unknown = power): Ability =>
  stat({
    kind: 'modifyPt',
    subject: { kind: 'this' },
    power,
    toughness,
  } as StaticEffect);
const defines = (power?: unknown, toughness?: unknown): Ability =>
  stat({
    kind: 'characteristicPt',
    ...(power === undefined ? {} : { power }),
    ...(toughness === undefined ? {} : { toughness }),
  } as StaticEffect);

describe('the amount of a modifyPt or setPt effect', () => {
  test('numbers (negative too), X, counts, a power read and multiples are valid and supported', () => {
    const valid: Effect[] = [
      pump(3, 3),
      pump(-2, -1),
      pump(X, 0),
      pump({ kind: 'times', factor: -1, of: X }, { kind: 'times', factor: -1, of: X }),
      pump(CREATURES, CREATURES),
      pump({ kind: 'times', factor: 2, of: CREATURES }, 0),
      pump({ kind: 'powerOf', of: T1 }, 0),
      {
        kind: 'setPt',
        objects: T1,
        power: CREATURES,
        toughness: { kind: 'times', factor: 2, of: CREATURES },
        duration: END,
      },
    ];
    for (const e of valid) {
      const card = spell(e);
      expect(issues(card), JSON.stringify(e)).toEqual([]);
      expect(unsupportedFeatureIssues(card), JSON.stringify(e)).toEqual([]);
    }
  });

  test('an X where nothing announces one is refused (CR 107.3a)', () => {
    expectIssue(issues(spell(pump(X, 0), false)), 'X is used but nothing');
  });

  test('a multiple needs a whole factor other than 0 and a counted or read amount', () => {
    expectIssue(issues(spell(pump({ kind: 'times', factor: 0, of: X }))), 'factor');
    expectIssue(issues(spell(pump({ kind: 'times', factor: 1.5, of: X }))), 'factor');
    expectIssue(
      issues(
        spell(pump({ kind: 'times', factor: 2, of: { kind: 'times', factor: 2, of: X } } as never)),
      ),
      'unknown amount times',
    );
    expectIssue(issues(spell(pump(0.5 as never))), 'must be an integer');
  });

  test('a multiple is for power and toughness only: other amounts refuse it', () => {
    const draw: Effect = {
      kind: 'draw',
      player: { kind: 'you' },
      count: { kind: 'times', factor: -1, of: X } as never,
    };
    expectIssue(issues(spell(draw)), 'unknown amount times');
  });

  test('the features list `times` and the characteristic-defining static', () => {
    expect(SUPPORTED_FEATURES.amountKinds).toContain('times');
    expect(SUPPORTED_FEATURES.staticKinds).toContain('characteristicPt');
    expect(isFeatureSupported('static:characteristicPt')).toBe(true);
    expect(isFeatureSupported('amount:times')).toBe(true);
  });
});

describe('the amount of a static modifyPt', () => {
  test('an integer, a count, and multiples of a count are valid and supported', () => {
    for (const a of [
      bonus(2, -1),
      bonus(CREATURES),
      bonus({ kind: 'times', factor: -1, of: CREATURES }, CREATURES),
    ]) {
      const card = creature([a]);
      expect(issues(card), JSON.stringify(a)).toEqual([]);
      expect(unsupportedFeatureIssues(card), JSON.stringify(a)).toEqual([]);
    }
  });

  test('an X, a power read, kicks and a multiple of one of them are refused (D-115)', () => {
    for (const amount of [
      X,
      { kind: 'powerOf', of: { kind: 'this' } },
      { kind: 'manaValueOf', of: { kind: 'this' } },
      { kind: 'timesKicked' },
      { kind: 'times', factor: 2, of: X },
    ]) {
      expectIssue(issues(creature([bonus(amount, 0)])), 'counts objects (countOf)');
    }
  });

  test('a count that compares power or toughness is refused, in the filter and in an anyOf member (CR 613.8)', () => {
    const reads = (filter: object) => ({ kind: 'countOf', filter });
    expectIssue(
      issues(
        creature([bonus(reads({ types: ['creature'], power: { cmp: 'atLeast', value: 3 } }))]),
      ),
      'cannot compare power or toughness',
    );
    expectIssue(
      issues(
        creature([
          bonus(
            reads({
              anyOf: [
                { types: ['creature'], toughness: { cmp: 'atMost', value: 1 } },
                { types: ['land'] },
              ],
            }),
          ),
        ]),
      ),
      'cannot compare power or toughness',
    );
    // Mana value is a copiable value no layer 7 effect changes: it is read.
    expect(
      issues(
        creature([bonus(reads({ types: ['creature'], manaValue: { cmp: 'atMost', value: 2 } }))]),
      ),
    ).toEqual([]);
  });

  test('an owner in the count is refused as everywhere outside an effect', () => {
    expectIssue(
      issues(
        creature([
          bonus({ kind: 'countOf', filter: { zone: 'graveyard', owner: { kind: 'you' } } }),
        ]),
      ),
      'owner is only read',
    );
  });

  test('a non-integer is refused', () => {
    expectIssue(issues(creature([bonus(1.5, 0)])), 'must be an integer');
  });
});

describe('a characteristic-defining ability and the "*" it needs (CR 208.2a, 604.3)', () => {
  const star = { power: '*', toughness: '*' } as const;

  test('power and toughness each defined, or only one of them, is valid and supported', () => {
    const both = creature([defines(HAND, HAND)], star);
    expect(issues(both)).toEqual([]);
    expect(unsupportedFeatureIssues(both)).toEqual([]);
    const powerOnly = creature([defines(CREATURES)], { power: '*', toughness: 3 });
    expect(issues(powerOnly)).toEqual([]);
    expect(unsupportedFeatureIssues(powerOnly)).toEqual([]);
    const toughnessOnly = creature([defines(undefined, CREATURES)], { power: 2, toughness: '*' });
    expect(issues(toughnessOnly)).toEqual([]);
    const twice = creature([defines({ kind: 'times', factor: 2, of: CREATURES }, HAND)], star);
    expect(issues(twice)).toEqual([]);
  });

  test('a printed star with no ability that defines it is refused (and unsupported)', () => {
    const none = creature([], star);
    expectIssue(issues(none), "a printed '*' power needs a characteristic-defining ability");
    expectIssue(issues(none), "a printed '*' toughness needs a characteristic-defining ability");
    expectIssue(
      unsupportedFeatureIssues(none).map((i) => i.message),
      'no characteristic-defining ability',
    );
    // Only one stat is defined: the other star is still refused.
    expectIssue(
      issues(creature([defines(HAND)], star)),
      "a printed '*' toughness needs a characteristic-defining ability",
    );
  });

  test('an ability that defines a stat the card prints as a number is refused', () => {
    expectIssue(
      issues(creature([defines(HAND, HAND)], { power: 2, toughness: '*' })),
      "the power, which the card must print as '*'",
    );
  });

  test('a stat defined twice is refused', () => {
    expectIssue(
      issues(creature([defines(HAND, HAND), defines(CREATURES)], star)),
      'defined by more than one ability',
    );
  });

  test('the ability defines something, and what it defines is a count or a positive multiple', () => {
    expectIssue(issues(creature([defines()], star)), 'defines power, toughness or both');
    expectIssue(issues(creature([defines(3, 3)], star)), 'a number is not a count');
    expectIssue(
      issues(creature([defines({ kind: 'times', factor: -1, of: HAND }, HAND)], star)),
      'positive multiple',
    );
    expectIssue(issues(creature([defines(X, X)], star)), 'counts objects (countOf)');
    expectIssue(
      issues(
        creature(
          [
            defines({
              kind: 'countOf',
              filter: { types: ['creature'], power: { cmp: 'atLeast', value: 2 } },
            }),
          ],
          { power: '*', toughness: 1 },
        ),
      ),
      'cannot compare power or toughness',
    );
  });

  test('a token prints numbers: a token with a star, or a definition on a numeric token, is refused', () => {
    const token = (power: PtValue, abilities: Ability[]): CardDefinition =>
      singleFace({
        name: 'SYNTHETIC Pt Probe Maker',
        manaCost: ['1'],
        types: ['sorcery'],
        colors: [],
        colorIdentity: [],
        oracleText: 'SYNTHETIC probe',
        spell: {
          effect: {
            kind: 'createToken',
            count: 1,
            token: {
              kind: 'custom',
              definition: {
                name: 'Probe',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Bear'],
                colors: [],
                power,
                toughness: 1,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities,
              },
            },
          },
        },
      });
    expectIssue(issues(token('*', [defines(HAND)])), 'a creature token needs a numeric power');
    expectIssue(issues(token(1, [defines(HAND)])), "which the card must print as '*'");
  });

  test('the fixtures that use them validate', () => {
    for (const name of [
      'SYNTHETIC Hand Hydra',
      'SYNTHETIC Land Lurker',
      'SYNTHETIC Horde Hound',
      'SYNTHETIC Grave Ghoul',
      'SYNTHETIC Lifeline Hydra',
      'SYNTHETIC Artisan Blade',
      'SYNTHETIC Withering Surge',
      'SYNTHETIC Rage Bear',
    ]) {
      expect(issues(syntheticCard(name)), name).toEqual([]);
    }
  });
});

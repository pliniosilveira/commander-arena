// Validation of `rollDie`, `dieResult` and `thisInYourGraveyard` (D-941). CR 706.1a (a die of N sides has N outcomes numbered 1 to N), CR 706.2
// (the result), CR 706.3b (the roll and what reads its result are one ability), CR 113.6b (an ability that works from the graveyard says so).
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Condition,
  type Effect,
  SUPPORTED_FEATURES,
  validateCard,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const roll = (sides: number): Effect => ({ kind: 'rollDie', sides });
const gain: Effect = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 };
const ifResult = (compare: Condition & { kind: 'dieResult' }, effect: Effect = gain): Effect => ({
  kind: 'conditional',
  condition: compare,
  effect,
});
const result = (cmp: 'atLeast' | 'atMost' | 'equal', value: number) =>
  ({ kind: 'dieResult', compare: { cmp, value } }) as const;
const seq = (...effects: Effect[]): Effect => ({ kind: 'sequence', effects });

function spell(effect: Effect): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    spell: { effect },
  });
}

function withAbility(ability: Ability): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [ability],
  });
}

const messages = (c: CardDefinition) => validateCard(c).map((i) => `${i.path}: ${i.message}`);

describe('the kinds are supported', () => {
  test('they are in SUPPORTED_FEATURES', () => {
    expect(SUPPORTED_FEATURES.effectKinds).toContain('rollDie');
    expect(SUPPORTED_FEATURES.conditionKinds).toContain('dieResult');
    expect(SUPPORTED_FEATURES.conditionKinds).toContain('thisInYourGraveyard');
  });
});

describe('rollDie', () => {
  test('a die of 2 or more sides is valid', () => {
    for (const sides of [2, 4, 6, 20, 100]) {
      expect(messages(spell(roll(sides))), String(sides)).toEqual([]);
    }
  });

  test('a die of fewer than 2 sides, a fraction or a non-number is refused', () => {
    for (const sides of [1, 0, -4, 1.5, Number.NaN, 4294967297]) {
      expect(messages(spell(roll(sides))).join('\n'), String(sides)).toMatch(
        /a die has a whole number of sides/,
      );
    }
    expect(
      messages(spell({ kind: 'rollDie', sides: '4' } as unknown as Effect)).join('\n'),
    ).toMatch(/a die has a whole number of sides/);
  });
});

describe('dieResult is read only after a roll of the same sequence', () => {
  test('after the roll, a number the die can show is valid, with every comparison', () => {
    for (const cmp of ['atLeast', 'atMost', 'equal'] as const) {
      expect(messages(spell(seq(roll(6), ifResult(result(cmp, 1))))), cmp).toEqual([]);
      expect(messages(spell(seq(roll(6), ifResult(result(cmp, 6))))), cmp).toEqual([]);
    }
  });

  test('a number the die cannot show, or less than 1, is refused', () => {
    expect(messages(spell(seq(roll(6), ifResult(result('equal', 7))))).join('\n')).toMatch(
      /a die result is a whole number from 1 to 6/,
    );
    expect(messages(spell(seq(roll(6), ifResult(result('atLeast', 0))))).join('\n')).toMatch(
      /from 1 to 6/,
    );
    expect(messages(spell(seq(roll(6), ifResult(result('atMost', 2.5))))).join('\n')).toMatch(
      /from 1 to 6/,
    );
  });

  test('without a roll before it, it is refused', () => {
    expect(messages(spell(seq(gain, ifResult(result('equal', 1))))).join('\n')).toMatch(
      /needs a rollDie before it/,
    );
    expect(messages(spell(ifResult(result('equal', 1)))).join('\n')).toMatch(
      /needs a rollDie before it/,
    );
    // A roll after the condition is no roll before it.
    expect(messages(spell(seq(ifResult(result('equal', 1)), roll(6)))).join('\n')).toMatch(
      /needs a rollDie before it/,
    );
  });

  test('a roll inside a branch is not a roll of the sequence', () => {
    const inner: Effect = {
      kind: 'conditional',
      condition: { kind: 'yourTurn' },
      effect: roll(6),
    };
    expect(messages(spell(seq(inner, ifResult(result('equal', 1))))).join('\n')).toMatch(
      /needs a rollDie before it/,
    );
  });

  test('the number is checked against the latest roll (the sides of a second roll count)', () => {
    expect(
      messages(spell(seq(roll(20), roll(4), ifResult(result('equal', 10))))).join('\n'),
    ).toMatch(/from 1 to 4/);
    expect(messages(spell(seq(roll(4), roll(20), ifResult(result('equal', 10)))))).toEqual([]);
  });

  test('it is not an intervening "if", a condition of the event, a cost condition or a static condition', () => {
    const triggered = (extra: Partial<Extract<Ability, { kind: 'triggered' }>>): Ability => ({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: gain,
      ...extra,
    });
    expect(
      messages(withAbility(triggered({ interveningIf: result('equal', 1) }))).join('\n'),
    ).toMatch(/only valid in a conditional effect after a rollDie/);
    expect(
      messages(withAbility(triggered({ triggerCondition: result('equal', 1) }))).join('\n'),
    ).toMatch(/only valid in a conditional effect after a rollDie/);
    expect(
      messages(
        withAbility({
          kind: 'static',
          static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 1, toughness: 1 },
          condition: result('equal', 1),
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('thisInYourGraveyard is for an ability that works from the graveyard', () => {
  const trigger = (extra: Partial<Extract<Ability, { kind: 'triggered' }>>): Ability => ({
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    interveningIf: { kind: 'thisInYourGraveyard' },
    effect: gain,
    ...extra,
  });

  test("with functionsIn: 'graveyard' it is valid", () => {
    expect(messages(withAbility(trigger({ functionsIn: 'graveyard' })))).toEqual([]);
  });

  test('on a battlefield ability, as an intervening "if" or the condition of the event, it is refused', () => {
    expect(messages(withAbility(trigger({}))).join('\n')).toMatch(
      /thisInYourGraveyard needs functionsIn/,
    );
    expect(
      messages(
        withAbility({
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'you' },
          triggerCondition: { kind: 'thisInYourGraveyard' },
          effect: gain,
        }),
      ).join('\n'),
    ).toMatch(/thisInYourGraveyard needs functionsIn/);
  });

  test('inside an "and" or a "not" it is still checked', () => {
    expect(
      messages(
        withAbility(
          trigger({
            interveningIf: {
              kind: 'and',
              terms: [{ kind: 'yourTurn' }, { kind: 'thisInYourGraveyard' }],
            },
          }),
        ),
      ).join('\n'),
    ).toMatch(/thisInYourGraveyard needs functionsIn/);
  });

  test('a static ability does not take it (its graveyard form is functionsIn)', () => {
    expect(
      messages(
        withAbility({
          kind: 'static',
          static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 1, toughness: 1 },
          condition: { kind: 'thisInYourGraveyard' },
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

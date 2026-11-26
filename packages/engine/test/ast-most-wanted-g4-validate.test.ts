// Most Wanted deck, group 4: what validateCard accepts and refuses for the two AST nodes the group adds. Cards are SYNTHETIC.
// Pins: CR 702.16a and 202.3 (protection from a mana value), CR 603.7 and 603.10a (a delayed triggered ability for each creature that dies this turn).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, validateCard } from '../src/index';

const card = (abilities: readonly Ability[]) =>
  singleFace({
    name: 'SYNTHETIC Group Four Probe',
    manaCost: ['2', 'W'],
    types: ['creature'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities,
  });

const protection = (keyword: unknown): Ability =>
  ({ kind: 'keyword', keyword }) as unknown as Ability;

describe('protection from a mana value', () => {
  test('a comparison and a whole number of at least 0 are valid', () => {
    for (const cmp of ['atLeast', 'atMost', 'equal']) {
      expect(
        validateCard(card([protection({ kind: 'protection', from: 'manaValue', cmp, value: 3 })])),
      ).toEqual([]);
    }
    expect(
      validateCard(
        card([protection({ kind: 'protection', from: 'manaValue', cmp: 'equal', value: 0 })]),
      ),
    ).toEqual([]);
  });

  test('a bad comparison, a negative or fractional number or a missing one is refused', () => {
    for (const bad of [
      { cmp: 'above', value: 3 },
      { cmp: 'atLeast', value: -1 },
      { cmp: 'atLeast', value: 1.5 },
      { cmp: 'atLeast' },
    ]) {
      expect(
        validateCard(card([protection({ kind: 'protection', from: 'manaValue', ...bad })])).length,
        JSON.stringify(bad),
      ).toBeGreaterThan(0);
    }
  });
});

describe('a delayed trigger for each creature that dies this turn', () => {
  const delayed = (effect: unknown, filter: unknown = { types: ['creature'] }): Ability =>
    ({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'delayedDiesTurn', filter, effect },
    }) as unknown as Ability;
  const pump = {
    kind: 'modifyPt',
    objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'], other: true } },
    power: -1,
    toughness: -1,
    duration: 'untilEndOfTurn',
  };

  test('a filter and an effect that names no target are valid', () => {
    expect(validateCard(card([delayed(pump)]))).toEqual([]);
  });

  test('an effect that names a target of the spell, or a filter with a zone, is refused', () => {
    const targeted = {
      kind: 'modifyPt',
      objects: { kind: 'target', id: 't1' },
      power: -1,
      toughness: -1,
      duration: 'untilEndOfTurn',
    };
    expect(validateCard(card([delayed(targeted)])).length).toBeGreaterThan(0);
    expect(
      validateCard(card([delayed(pump, { types: ['creature'], zone: 'graveyard' })])).length,
    ).toBeGreaterThan(0);
  });
});

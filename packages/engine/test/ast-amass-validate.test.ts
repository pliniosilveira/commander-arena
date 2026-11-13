// validateCard for "amass Zombies N" (CR 701.47a, D-367): the effect is listed as run, takes a creature type and an amount, and refuses what an Army cannot be.
// Cards are SYNTHETIC and defined here or in src/cards/fixtures.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, SUPPORTED_FEATURES } from '../src/ast/features';
import type { Effect } from '../src/ast/types';
import { validateCard, validateCardStructure } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';

const rite = (effect: unknown) =>
  singleFace({
    name: 'SYNTHETIC Test Amass',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'test',
    spell: { effect: effect as Effect },
  });
const structure = (effect: unknown) =>
  validateCardStructure(rite(effect)).map((i) => `${i.path}: ${i.message}`);
const gate = (effect: unknown) => validateCard(rite(effect)).map((i) => `${i.path}: ${i.message}`);

describe('the registry lists what the engine runs', () => {
  test('amass is a supported effect', () => {
    expect(SUPPORTED_FEATURES.effectKinds).toContain('amass');
    expect(isFeatureSupported('effect:amass')).toBe(true);
  });
});

describe('the operands', () => {
  test('a creature type and a number are valid', () => {
    expect(structure({ kind: 'amass', subtype: 'Zombie', count: 1 })).toEqual([]);
    expect(gate({ kind: 'amass', subtype: 'Orc', count: 3 })).toEqual([]);
  });

  test('X is valid in a spell with an X (CR 107.3a)', () => {
    const card = singleFace({
      name: 'SYNTHETIC Test Amass X',
      manaCost: ['X', 'B'],
      types: ['sorcery'],
      colors: ['B'],
      colorIdentity: ['B'],
      oracleText: 'test',
      spell: { effect: { kind: 'amass', subtype: 'Zombie', count: { kind: 'x' } }, x: true },
    });
    expect(validateCard(card)).toEqual([]);
  });

  test('X in a spell with no X is refused', () => {
    expect(structure({ kind: 'amass', subtype: 'Zombie', count: { kind: 'x' } })).not.toEqual([]);
  });

  test.each([
    ['an empty type', ''],
    ['a type that is not a creature type', 'Aura'],
    ['a type that is not a creature type either', 'Lesson'],
  ])('%s is refused', (_label, subtype) => {
    expect(structure({ kind: 'amass', subtype, count: 1 })).not.toEqual([]);
  });

  test.each([
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['a word', 'one'],
  ])('%s is refused as the count', (_label, count) => {
    expect(structure({ kind: 'amass', subtype: 'Zombie', count })).not.toEqual([]);
  });

  test('a missing type is refused', () => {
    expect(structure({ kind: 'amass', count: 1 })).not.toEqual([]);
  });
});

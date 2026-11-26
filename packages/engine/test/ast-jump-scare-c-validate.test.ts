// Jump Scare! deck (issue 108), group C: what `validateCard` allows of the conditions of a static ability.
// Pins: CR 613.8 (a layer 4 effect may not read what the layers change; the counters on the permanent belong to no layer), CR 122.1 (counters), CR 601.3b (a permission to cast as though it
// had flash is read as the spell is cast), CR 601.3 and 401.5 (a permission to cast from the top of the library), CR 208.1 (the powers compared).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';

/** A card that is SYNTHETIC Festive Chief (a creature) with one static ability, `static`, under `condition`. */
const withStatic = (staticEffect: unknown, condition: unknown) => {
  const base = syntheticCard('SYNTHETIC Festive Chief');
  const face = base.faces[0];
  if (face === undefined) throw new Error('no face');
  return {
    ...base,
    faces: [{ ...face, abilities: [{ kind: 'static', static: staticEffect, condition }] }],
  } as never;
};

const THIS = { kind: 'this' };
const LAND = { kind: 'setTypes', subject: THIS, types: ['land'] };
const FROM_TOP = { kind: 'castFromTopOfLibrary', spells: { types: ['creature'] } };
const FLASH = { kind: 'castAsThoughFlash', spells: { notTypes: ['creature'], controller: 'you' } };
const DIFFERENT = {
  kind: 'controlsDifferentPowers',
  filter: { types: ['creature'] },
  count: 3,
};
const EVEN = { kind: 'thisPowerParity', parity: 'even' };
const text = (problems: unknown) => JSON.stringify(problems);

describe('a layer 4 static ability may test the counters on the permanent itself', () => {
  test('"~ has a slumber counter on it" is read for a set of types', () => {
    const condition = { kind: 'thisMatches', filter: { hasCounter: 'slumber' } };
    expect(validateCard(withStatic(LAND, condition))).toEqual([]);
  });

  test('a test of a counter of any kind is read too', () => {
    const condition = { kind: 'thisMatches', filter: { hasCounter: true } };
    expect(validateCard(withStatic(LAND, condition))).toEqual([]);
  });

  test('a test of a type or a keyword of the permanent is not: the layers change those (CR 613.8)', () => {
    for (const filter of [
      { hasCounter: 'slumber', types: ['creature'] },
      { hasCounter: 'slumber', keywords: [{ kind: 'flying' }] },
      { types: ['creature'] },
    ]) {
      const problems = validateCard(withStatic(LAND, { kind: 'thisMatches', filter }));
      expect(text(problems)).toContain('reads no characteristic');
    }
  });

  test('a count of the counters is not read in a layer 4 effect', () => {
    const condition = {
      kind: 'amountIs',
      amount: { kind: 'countersOn', of: THIS, counter: 'slumber' },
      compare: { cmp: 'atLeast', value: 1 },
    };
    expect(text(validateCard(withStatic(LAND, condition)))).toContain('reads no characteristic');
  });
});

describe('a permission to cast reads the powers of permanents as the spell is cast', () => {
  test('three or more creatures with different powers goes with a cast from the top of the library', () => {
    expect(validateCard(withStatic(FROM_TOP, DIFFERENT))).toEqual([]);
  });

  test('so does the parity of the power of the permanent', () => {
    expect(validateCard(withStatic(FROM_TOP, EVEN))).toEqual([]);
  });

  test('and both go with a permanent permission to cast as though it had flash', () => {
    expect(validateCard(withStatic(FLASH, EVEN))).toEqual([]);
    expect(validateCard(withStatic(FLASH, DIFFERENT))).toEqual([]);
  });

  test('a static ability that works in a layer may not read them: its own result would depend on a layer 7 value', () => {
    const pump = { kind: 'modifyPt', subject: THIS, power: 1, toughness: 1 };
    expect(text(validateCard(withStatic(pump, DIFFERENT)))).toContain('controlsDifferentPowers');
    expect(text(validateCard(withStatic(pump, EVEN)))).toContain('thisPowerParity');
    expect(text(validateCard(withStatic(LAND, EVEN)))).toContain('reads no characteristic');
  });

  test('the permission of a permanent takes no other condition than these', () => {
    const life = { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 10 } };
    expect(text(validateCard(withStatic(FLASH, life)))).toContain('takes only a condition');
  });

  test('different powers needs at least two permanents, on the battlefield, that the controller controls', () => {
    expect(text(validateCard(withStatic(FROM_TOP, { ...DIFFERENT, count: 1 })))).toContain(
      'at least two',
    );
    const elsewhere = { ...DIFFERENT, filter: { types: ['creature'], zone: 'graveyard' } };
    expect(text(validateCard(withStatic(FROM_TOP, elsewhere)))).toContain('battlefield');
    const opponents = { ...DIFFERENT, filter: { types: ['creature'], controller: 'opponent' } };
    expect(text(validateCard(withStatic(FROM_TOP, opponents)))).toContain('you control');
  });

  test('the parity is even or odd', () => {
    const bad = { kind: 'thisPowerParity', parity: 'prime' };
    expect(text(validateCard(withStatic(FROM_TOP, bad)))).toContain('even or odd');
  });
});

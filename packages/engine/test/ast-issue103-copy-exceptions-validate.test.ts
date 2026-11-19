// The shapes issue 103 adds to the copy effects and the step trigger are checked by `validateCard` (CR 707.9b, 205.4a, 505.1): `becomeCopy.addSupertypes`,
// `entersAsCopy.addSubtypes`, `createToken.copyOf.addTypes` and `step.alsoStep`. The cards are SYNTHETIC shapes built from a fixture, not real cards.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';

const base = syntheticCard('SYNTHETIC Cursed Looking Glass');
const face = base.faces[0];
if (face === undefined) throw new Error('no face');
const withAbilities = (abilities: unknown[]) =>
  ({ ...base, faces: [{ ...face, abilities }] }) as never;

const entersAsCopy = (extra: Record<string, unknown>) => ({
  kind: 'replacement',
  replacement: {
    kind: 'entersAsCopy',
    what: { types: ['creature'], controller: 'you' },
    duration: 'permanent',
    ...extra,
  },
});
const effectOf = (effect: unknown) => ({
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect,
});
const becomeCopy = (extra: Record<string, unknown>) =>
  effectOf({
    kind: 'becomeCopy',
    objects: { kind: 'this' },
    of: { kind: 'this' },
    duration: 'untilEndOfTurn',
    ...extra,
  });
const copyToken = (extra: Record<string, unknown>) =>
  effectOf({
    kind: 'createToken',
    token: { kind: 'copyOf', object: { kind: 'this' }, ...extra },
    count: 1,
  });
const step = (extra: Record<string, unknown>) => ({
  kind: 'triggered',
  trigger: { kind: 'step', step: 'main1', whose: 'you', ...extra },
  effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
});

describe('entersAsCopy.addSubtypes (CR 707.9b)', () => {
  test('a list of creature types is valid', () => {
    expect(validateCard(withAbilities([entersAsCopy({ addSubtypes: ['Dragon'] })]))).toEqual([]);
  });
  test('an empty list, a non-creature type and a non-list are refused', () => {
    for (const bad of [[], ['Equipment'], 'Dragon']) {
      expect(
        validateCard(withAbilities([entersAsCopy({ addSubtypes: bad })])).length,
        JSON.stringify(bad),
      ).toBeGreaterThan(0);
    }
  });
});

describe('becomeCopy.addSupertypes (CR 707.9b, 205.4a)', () => {
  test('legendary is valid with keepName', () => {
    expect(
      validateCard(withAbilities([becomeCopy({ keepName: true, addSupertypes: ['legendary'] })])),
    ).toEqual([]);
  });
  test('an empty list and an unknown supertype are refused', () => {
    for (const bad of [[], ['mythic']]) {
      expect(
        validateCard(withAbilities([becomeCopy({ addSupertypes: bad })])).length,
        JSON.stringify(bad),
      ).toBeGreaterThan(0);
    }
  });
});

describe('createToken copyOf.addTypes (CR 707.9b)', () => {
  test('the shape of Will of the Temur is valid', () => {
    expect(
      validateCard(
        withAbilities([
          copyToken({
            setPt: { power: 4, toughness: 4 },
            addSubtypes: ['Dragon'],
            addTypes: ['creature'],
            abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
          }),
        ]),
      ),
    ).toEqual([]);
  });
  test('an empty list and an unknown card type are refused', () => {
    for (const bad of [[], ['dragon']]) {
      expect(
        validateCard(withAbilities([copyToken({ addTypes: bad })])).length,
        JSON.stringify(bad),
      ).toBeGreaterThan(0);
    }
  });
});

describe('step.alsoStep (CR 505.1)', () => {
  test('the postcombat main phase beside the precombat one is valid', () => {
    expect(validateCard(withAbilities([step({ alsoStep: 'main2' })]))).toEqual([]);
  });
  test('the same step twice and an unknown step are refused', () => {
    for (const bad of ['main1', 'sometime']) {
      expect(validateCard(withAbilities([step({ alsoStep: bad })])).length, bad).toBeGreaterThan(0);
    }
  });
});

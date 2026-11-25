// `entersAsCopy.addStatics` (Mocking Doppelganger, CR 707.9a, 707.9b) and the filter `sameNameAsSource` (CR 201.2) are checked by `validateCard`. The cards are SYNTHETIC shapes built
// from a fixture, not real cards.
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
    what: { types: ['creature'], controller: 'opponent' },
    duration: 'permanent',
    ...extra,
  },
});
const sameNameGoaded = {
  kind: 'static',
  static: {
    kind: 'goaded',
    subject: {
      kind: 'filter',
      other: true,
      filter: { types: ['creature'], sameNameAsSource: true },
    },
  },
};

describe('entersAsCopy.addStatics (CR 707.9b)', () => {
  test('a static goad of the creatures with the same name is valid', () => {
    expect(validateCard(withAbilities([entersAsCopy({ addStatics: [sameNameGoaded] })]))).toEqual(
      [],
    );
  });
  test('an empty list, a non-list and an ability that is not static are refused', () => {
    const draw = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    for (const bad of [[], sameNameGoaded, [draw]]) {
      expect(
        validateCard(withAbilities([entersAsCopy({ addStatics: bad })])).length,
        JSON.stringify(bad),
      ).toBeGreaterThan(0);
    }
  });
});

// `becomeCopy.withThisAbility` (CR 707.9b: "..., except it has this ability") is checked by `validateCard`: the flag is `true`, and only an ability has an ability that is
// resolving to give. The cards are SYNTHETIC shapes built from a fixture, not real cards.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';

const base = syntheticCard('SYNTHETIC Cursed Looking Glass');
const face = base.faces[0];
if (face === undefined) throw new Error('no face');
const withAbilities = (abilities: unknown[]) =>
  ({ ...base, faces: [{ ...face, abilities }] }) as never;

const becomeCopy = {
  kind: 'becomeCopy',
  objects: { kind: 'this' },
  of: { kind: 'this' },
  duration: 'permanent',
  withThisAbility: true,
};

describe('becomeCopy.withThisAbility (CR 707.9b)', () => {
  test('true is valid in a triggered ability', () => {
    expect(
      validateCard(
        withAbilities([
          {
            kind: 'triggered',
            trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
            effect: becomeCopy,
          },
        ]),
      ),
    ).toEqual([]);
  });

  test('anything but true is refused', () => {
    expect(
      validateCard(
        withAbilities([
          {
            kind: 'triggered',
            trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
            effect: { ...becomeCopy, withThisAbility: false },
          },
        ]),
      ).length,
    ).toBeGreaterThan(0);
  });
});

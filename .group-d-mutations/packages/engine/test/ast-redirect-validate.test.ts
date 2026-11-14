// The validator of the damage redirection shapes (D-192): the replacement `redirectDamage` and the static `keepsDamage`.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { SUPPORTED_FEATURES, syntheticCard, validateCard } from '../src/index';

const TOISE = 'SYNTHETIC Ancient Adamantoise';

const withAbilities = (abilities: readonly Ability[], types?: readonly string[]) => {
  const card = syntheticCard(TOISE);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return {
    ...card,
    faces: [{ ...face, abilities, ...(types === undefined ? {} : { types }) }],
  } as never;
};
const redirect = (extra: Record<string, unknown>): Ability =>
  ({ kind: 'replacement', replacement: { kind: 'redirectDamage', you: true, ...extra } }) as never;
const keeps = (extra: Record<string, unknown> = {}): Ability =>
  ({
    kind: 'static',
    static: { kind: 'keepsDamage', subject: { kind: 'this' }, ...extra },
  }) as never;

describe('the Adamantoise fixture', () => {
  test('is valid, with its real wording, and both kinds are in the supported features', () => {
    expect(validateCard(syntheticCard(TOISE))).toEqual([]);
    expect(SUPPORTED_FEATURES.replacementKinds).toContain('redirectDamage');
    expect(SUPPORTED_FEATURES.staticKinds).toContain('keepsDamage');
  });
});

describe('redirectDamage', () => {
  test('"you and other permanents you control", "you" alone and the permanents alone are valid', () => {
    expect(validateCard(withAbilities([redirect({ permanents: { controller: 'you' } })]))).toEqual(
      [],
    );
    expect(validateCard(withAbilities([redirect({})]))).toEqual([]);
    expect(
      validateCard(
        withAbilities([
          redirect({ you: false, permanents: { controller: 'you', types: ['creature'] } }),
        ]),
      ),
    ).toEqual([]);
  });

  test('it names a recipient: neither "you" nor permanents is refused', () => {
    expect(validateCard(withAbilities([redirect({ you: false })])).length).toBeGreaterThan(0);
  });

  test("the permanents are the controller's own: another controller (an opponent, no controller) is refused", () => {
    expect(
      validateCard(withAbilities([redirect({ permanents: { controller: 'opponent' } })])).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withAbilities([redirect({ permanents: { types: ['creature'] } })])).length,
    ).toBeGreaterThan(0);
  });

  test('the recipients are permanents on the battlefield: a zone, an owner or a reading of the turn is refused', () => {
    for (const filter of [
      { controller: 'you', zone: 'graveyard' },
      { controller: 'you', putFromBattlefieldThisTurn: true },
      { controller: 'you', stackKind: 'spell' },
    ]) {
      expect(
        validateCard(withAbilities([redirect({ permanents: filter })])).length,
      ).toBeGreaterThan(0);
    }
  });

  test('"you" must be a boolean', () => {
    expect(validateCard(withAbilities([redirect({ you: 'yes' })])).length).toBeGreaterThan(0);
  });

  test('the damage is dealt to the permanent with the ability, so only a creature face has it (CR 614.9)', () => {
    const noncreature = withAbilities(
      [redirect({ permanents: { controller: 'you' } })],
      ['artifact'],
    );
    expect(validateCard(noncreature).length).toBeGreaterThan(0);
  });
});

describe('keepsDamage', () => {
  test('is about the permanent itself', () => {
    expect(validateCard(withAbilities([keeps()]))).toEqual([]);
    expect(
      validateCard(withAbilities([keeps({ subject: { kind: 'attached' } })])).length,
    ).toBeGreaterThan(0);
  });

  test('a condition is not read for it', () => {
    const conditional = {
      kind: 'static',
      static: { kind: 'keepsDamage', subject: { kind: 'this' } },
      condition: { kind: 'youControl', filter: { types: ['land'] }, atLeast: 1 },
    } as never;
    expect(validateCard(withAbilities([conditional])).length).toBeGreaterThan(0);
  });
});

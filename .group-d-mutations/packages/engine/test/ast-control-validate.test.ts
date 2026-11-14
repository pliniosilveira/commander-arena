// The validator of the control-change shapes (D-189): `gainControl`, its durations, and the trigger `tapsForMana`.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { syntheticCard, validateCard } from '../src/index';

const NABBER = 'SYNTHETIC Treasure Nabber';
const LEASH = 'SYNTHETIC Mind Leash';
const THEFT = 'SYNTHETIC Lasting Theft';

const withAbility = (name: string, ability: Ability) => {
  const card = syntheticCard(name);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, abilities: [ability] }] } as never;
};
const withSpell = (name: string, effect: unknown) => {
  const card = syntheticCard(name);
  const face = card.faces[0];
  if (face === undefined || face.spell === null) throw new Error('no spell');
  return { ...card, faces: [{ ...face, spell: { ...face.spell, effect } }] } as never;
};
const trigger = (
  extra: Record<string, unknown>,
  effect: unknown = {
    kind: 'gainControl',
    objects: { kind: 'triggerSubject' },
    duration: 'untilEndOfYourNextTurn',
  },
) =>
  ({
    kind: 'triggered',
    trigger: { kind: 'tapsForMana', who: 'opponent', what: { types: ['artifact'] }, ...extra },
    effect,
  }) as never;

describe('tapsForMana', () => {
  test('the shape of the card is valid', () => {
    expect(validateCard(withAbility(NABBER, trigger({})))).toEqual([]);
    expect(validateCard(withAbility(NABBER, trigger({ who: 'you' })))).toEqual([]);
    expect(validateCard(withAbility(NABBER, trigger({ who: 'any' })))).toEqual([]);
  });

  test('who is you, opponent or any', () => {
    expect(validateCard(withAbility(NABBER, trigger({ who: 'nobody' }))).length).toBeGreaterThan(0);
  });

  test('the permanent tapped is on the battlefield: no zone or owner', () => {
    expect(
      validateCard(
        withAbility(NABBER, trigger({ what: { types: ['artifact'], zone: 'graveyard' } })),
      ).length,
    ).toBeGreaterThan(0);
  });

  test('an ability that adds mana is a triggered mana ability, which is tappedForMana', () => {
    const add = { kind: 'addMana', mana: { kind: 'fixed', mana: ['C'] } };
    expect(validateCard(withAbility(NABBER, trigger({}, add))).length).toBeGreaterThan(0);
    expect(
      validateCard(withAbility(NABBER, trigger({}, { kind: 'sequence', effects: [add] }))).length,
    ).toBeGreaterThan(0);
  });
});

describe('gainControl', () => {
  const gain = (extra: Record<string, unknown>) => ({
    kind: 'gainControl',
    objects: { kind: 'target', id: 't1' },
    duration: 'untilEndOfTurn',
    ...extra,
  });

  test('a target, with each duration, in a spell', () => {
    for (const duration of ['untilEndOfTurn', 'untilEndOfYourNextTurn', 'permanent']) {
      expect(validateCard(withSpell(THEFT, gain({ duration })))).toEqual([]);
    }
  });

  test('an unknown duration is refused', () => {
    expect(validateCard(withSpell(THEFT, gain({ duration: 'forever' }))).length).toBeGreaterThan(0);
  });

  test('only a target or the triggering permanent is named: not "each", not "this", not a target that does not exist', () => {
    expect(
      validateCard(
        withSpell(THEFT, gain({ objects: { kind: 'each', filter: { types: ['creature'] } } })),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withSpell(THEFT, gain({ objects: { kind: 'this' } }))).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withSpell(THEFT, gain({ objects: { kind: 'target', id: 'nope' } }))).length,
    ).toBeGreaterThan(0);
  });

  test('the triggering permanent needs a trigger that has one', () => {
    const triggering = gain({ objects: { kind: 'triggerSubject' } });
    expect(validateCard(withSpell(THEFT, triggering)).length).toBeGreaterThan(0);
  });

  test('"for as long as you control this" is the effect of an ability of a permanent, not of a spell', () => {
    expect(
      validateCard(withSpell(THEFT, gain({ duration: 'forAsLongAsYouControlThis' }))).length,
    ).toBeGreaterThan(0);
    expect(validateCard(syntheticCard(LEASH))).toEqual([]);
  });
});

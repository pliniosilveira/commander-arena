// `moveToZone.putWithSource` on a card chosen from the hand or the graveyard (CR 400.7: the permanent remembers which object's ability put it onto the battlefield) and the limit "mana
// value of the permanent the trigger is about" (CR 202.3), validated on SYNTHETIC cards that carry no text of a real card. The real Kodama of the East Tree is read and run in
// `packages/cards/test/convert-grammar-engine-animated-army-kodama.test.ts`.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type CardDefinition, type ObjectFilter, validateCard } from '../src/index';

const ENTER: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { other: true, controller: 'you' } },
  effect: {
    kind: 'moveToZone',
    objects: {
      kind: 'choose',
      filter: {
        zone: 'hand',
        controller: 'you',
        manaValueAtMost: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
      },
    },
    to: 'battlefield',
    putWithSource: true,
  },
  optional: true,
  interveningIf: {
    kind: 'not',
    term: { kind: 'subjectMatches', filter: { putWithSource: true } },
  },
};

const card = (ability: Ability): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Put-With Watcher',
    manaCost: ['2'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'SYNTHETIC test card.',
    abilities: [ability],
  });

const withFilter = (filter: ObjectFilter): Ability => {
  if (ENTER.kind !== 'triggered' || ENTER.effect.kind !== 'moveToZone') throw new Error('shape');
  return {
    ...ENTER,
    effect: { ...ENTER.effect, objects: { kind: 'choose', filter } },
  };
};

describe('putWithSource with a choice (CR 400.7)', () => {
  test('a card chosen from the hand is remembered', () => {
    expect(validateCard(card(ENTER))).toEqual([]);
  });

  test('a card chosen from the graveyard is remembered', () => {
    expect(validateCard(card(withFilter({ zone: 'graveyard', controller: 'you' })))).toEqual([]);
  });

  test('a permanent chosen on the battlefield is not put anywhere', () => {
    expect(
      validateCard(card(withFilter({ zone: 'battlefield', controller: 'you' }))).length,
    ).toBeGreaterThan(0);
  });

  test('reading the link without an ability that makes it is refused', () => {
    const noMaker: Ability = {
      ...ENTER,
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    } as Ability;
    expect(validateCard(card(noMaker)).length).toBeGreaterThan(0);
  });

  test('the mana value of the permanent that entered is no limit outside a trigger about a permanent', () => {
    const spell: Ability = {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', whose: 'you' },
      effect:
        ENTER.kind === 'triggered'
          ? ENTER.effect
          : { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    } as Ability;
    expect(validateCard(card(spell)).length).toBeGreaterThan(0);
  });
});

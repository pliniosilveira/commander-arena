// `validateCard` of the static `giveTypesToCardsOffBattlefield` (Dune Chanter, CR 613.1d, 205.1b): the cards a filter names outside the battlefield get types in addition to their own.
// The cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { ObjectFilter } from '../src/ast/types';
import { validateCard } from '../src/index';
import { singleFaceCard } from './dsl-helpers';

function card(
  what: ObjectFilter,
  extra: { subtypes?: readonly string[]; types?: readonly string[] } = {},
) {
  return singleFaceCard({
    name: 'SYNTHETIC Off Battlefield Giver',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Plant'],
    power: 2,
    toughness: 3,
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'SYNTHETIC',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'giveTypesToCardsOffBattlefield', what, ...extra } as never,
      },
    ],
  });
}

describe('giveTypesToCardsOffBattlefield', () => {
  test('lands you own that get a land type are valid', () => {
    expect(
      validateCard(card({ types: ['land'], controller: 'you' }, { subtypes: ['Desert'] })),
    ).toEqual([]);
  });

  test('a card type alone is valid too', () => {
    expect(validateCard(card({ types: ['land'] }, { types: ['artifact'] }))).toEqual([]);
  });

  test.each([
    ['a zone', { types: ['land'], zone: 'graveyard' } as ObjectFilter],
    ['an owner', { types: ['land'], owner: { kind: 'you' } } as ObjectFilter],
    ['an opponent controller', { types: ['land'], controller: 'opponent' } as ObjectFilter],
  ])('%s in the filter is refused', (_label, what) => {
    expect(validateCard(card(what, { subtypes: ['Desert'] })).length).toBeGreaterThan(0);
  });

  test('giving no type is refused', () => {
    expect(validateCard(card({ types: ['land'] })).length).toBeGreaterThan(0);
  });
});

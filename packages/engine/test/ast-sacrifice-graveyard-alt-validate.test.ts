// What `validateCard` allows of the `sacrificeFromGraveyard` alternative cost (issue 159, Scourge of Nel Toth).
import { describe, expect, test } from 'vitest';
import type { AlternativeCost, ObjectFilter } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';

const CREATURES: ObjectFilter = { types: ['creature'] };
const alt = (
  over: Partial<Extract<AlternativeCost, { kind: 'sacrificeFromGraveyard' }>> = {},
): AlternativeCost => ({
  kind: 'sacrificeFromGraveyard',
  cost: [{ kind: 'mana', symbols: ['B', 'B'] }],
  filter: CREATURES,
  count: 2,
  ...over,
});

const card = (
  alternative: AlternativeCost,
  types: readonly ['land'] | readonly ['creature'] = ['creature'],
) =>
  singleFace({
    name: 'SYNTHETIC Sacrifice Scourge',
    manaCost: ['5', 'B', 'B'],
    types,
    colors: ['B'],
    colorIdentity: ['B'],
    power: 6,
    toughness: 6,
    oracleText: '',
    alternativeCosts: [alternative],
  });

const messages = (c: ReturnType<typeof card>) => validateCard(c).map((i) => i.message);

describe('the sacrificeFromGraveyard alternative cost', () => {
  test('a mana cost, a count and a filter is valid', () => {
    expect(messages(card(alt()))).toEqual([]);
  });

  test.each([0, -1, 1.5])('a count of %s is refused', (count) => {
    expect(messages(card(alt({ count }))).join('|')).toContain('positive whole number');
  });

  test('a cost that is not mana is refused', () => {
    expect(messages(card(alt({ cost: [{ kind: 'payLife', amount: 2 }] }))).join('|')).toContain(
      'mana only',
    );
  });

  test('it is not on a land', () => {
    expect(messages(card(alt(), ['land'])).join('|')).toContain('not on a land');
  });
});

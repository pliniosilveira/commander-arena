import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const HIVE = singleFace({
  name: 'SYNTHETIC Corrupted Hive',
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    'SYNTHETIC: while an opponent has three poison counters, toxic creatures you control have lifelink.',
  abilities: [
    {
      kind: 'static',
      condition: { kind: 'opponentPoisonAtLeast', count: 3 },
      static: {
        kind: 'grantKeyword',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], controller: 'you', keywords: ['toxic'] },
        },
        keyword: { kind: 'lifelink' },
      },
    },
  ],
});

const MITE = singleFace({
  name: 'SYNTHETIC Toxic Mite',
  manaCost: null,
  types: ['artifact', 'creature'],
  subtypes: ['Phyrexian', 'Mite'],
  colors: [],
  colorIdentity: [],
  power: 1,
  toughness: 1,
  oracleText: 'SYNTHETIC: Toxic 1.',
  abilities: [{ kind: 'keyword', keyword: { kind: 'toxic', count: 1 } }],
});

function hasLifelink(poison: number): boolean {
  const g = scenario()
    .define(HIVE)
    .define(MITE)
    .seat(0)
    .battlefield(HIVE.name)
    .battlefield(MITE.name)
    .seat(1)
    .poison(poison)
    .build();
  return derive(g.state, g.object(MITE.name)).abilities.some(
    (ability) => ability.kind === 'keyword' && ability.keyword.kind === 'lifelink',
  );
}

describe('corrupted', () => {
  test('the ability applies to creatures with toxic at three or more poison counters on an opponent', () => {
    expect(hasLifelink(2)).toBe(false);
    expect(hasLifelink(3)).toBe(true);
  });
});

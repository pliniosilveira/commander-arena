import { describe, expect, test } from 'vitest';
import {
  addToPool,
  emptyPool,
  poolColorCounts,
  restrictedMana,
  restrictionAllows,
  usableMana,
  usablePoolIndices,
} from '../src/mana/index';
import { ABILITIES_ONLY, CREATURE_ONLY, mana } from './mana-fixtures';

describe('pool helpers (CR 106.4, 106.6)', () => {
  test('emptyPool returns a fresh empty array each time', () => {
    const a = emptyPool();
    expect(a).toEqual([]);
    expect(emptyPool()).not.toBe(a);
  });

  test('addToPool appends without mutating either input', () => {
    const pool = [mana('W')];
    const added = [mana('U'), mana('U', { snow: true })];
    const out = addToPool(pool, added);
    expect(out).toEqual([pool[0], added[0], added[1]]);
    expect(pool).toHaveLength(1);
    expect(added).toHaveLength(2);
    expect(out).not.toBe(pool);
  });

  test('restrictionAllows', () => {
    expect(restrictionAllows(null, { types: ['instant'] })).toBe(true);
    expect(restrictionAllows(null, { ability: true })).toBe(true);
    expect(restrictionAllows(CREATURE_ONLY, { types: ['artifact', 'creature'] })).toBe(true);
    expect(restrictionAllows(CREATURE_ONLY, { types: ['instant'] })).toBe(false);
    expect(restrictionAllows(CREATURE_ONLY, { ability: true })).toBe(false);
    expect(restrictionAllows(ABILITIES_ONLY, { ability: true })).toBe(true);
    expect(restrictionAllows(ABILITIES_ONLY, { types: ['creature'] })).toBe(false);
    expect(restrictionAllows({ kind: 'spellTypes', types: [] }, { types: ['creature'] })).toBe(
      false,
    );
  });

  test('filtering by restriction', () => {
    const pool = [
      mana('W'),
      mana('U', { restriction: CREATURE_ONLY }),
      mana('B', { restriction: ABILITIES_ONLY }),
    ];
    expect(restrictedMana(pool).map((m) => m.color)).toEqual(['U', 'B']);
    expect(usablePoolIndices(pool, { types: ['creature'] })).toEqual([0, 1]);
    expect(usablePoolIndices(pool, { types: ['sorcery'] })).toEqual([0]);
    expect(usablePoolIndices(pool, { ability: true })).toEqual([0, 2]);
    expect(usableMana(pool, { ability: true }).map((m) => m.color)).toEqual(['W', 'B']);
  });

  test('poolColorCounts', () => {
    expect(poolColorCounts([mana('W'), mana('W'), mana('C')])).toEqual({
      W: 2,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 1,
    });
    expect(poolColorCounts(emptyPool())).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });
});

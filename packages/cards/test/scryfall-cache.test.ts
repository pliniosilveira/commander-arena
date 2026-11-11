import { describe, expect, test } from 'vitest';
import { DEFAULT_CACHE_TTL_MS, MemoryCardCache, toStoredCard } from '../src/scryfall';
import { syntheticCard } from './scryfall-helpers';

// SYNTHETIC card data.

const HOUR = 60 * 60 * 1000;
const card = (() => {
  const stored = toStoredCard(syntheticCard('Synthetic Bear'), 0);
  if (!stored) throw new Error('fixture card must convert');
  return stored;
})();

function setup(ttlMs?: number) {
  const clock = { time: 5_000_000 };
  const cache = new MemoryCardCache({ now: () => clock.time, ttlMs });
  return { clock, cache };
}

describe('MemoryCardCache', () => {
  test('returns what was put, and undefined for an unknown key', async () => {
    const { cache } = setup();
    await cache.put('synthetic bear', card);
    expect(await cache.get('synthetic bear')).toBe(card);
    expect(await cache.get('something else')).toBeUndefined();
  });

  test('the default time to live is 24 hours', async () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(24 * HOUR);
    const { clock, cache } = setup();
    await cache.put('k', card);
    clock.time += 24 * HOUR - 1;
    expect(await cache.get('k')).toBe(card);
    clock.time += 1;
    expect(await cache.get('k')).toBeUndefined();
  });

  test('an expired entry is treated as missing and can be replaced', async () => {
    const { clock, cache } = setup(HOUR);
    await cache.put('k', card);
    clock.time += 2 * HOUR;
    expect(await cache.get('k')).toBeUndefined();
    await cache.put('k', card);
    expect(await cache.get('k')).toBe(card);
  });

  test('delete removes one key, clear removes all', async () => {
    const { cache } = setup();
    await cache.put('a', card);
    await cache.put('b', card);
    await cache.delete('a');
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBe(card);
    await cache.clear();
    expect(await cache.get('b')).toBeUndefined();
  });
});

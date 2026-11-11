import { describe, expect, test } from 'vitest';
import {
  cachedSupport,
  MemorySupportCache,
  PARSER_VERSION,
  type SupportCache,
  type SupportReport,
} from '../src/index';
import { SYNTHETIC_KEYWORD_CREATURE, SYNTHETIC_VANILLA } from './convert-helpers';

/** A cache that counts its writes. */
class CountingCache extends MemorySupportCache implements SupportCache {
  puts = 0;
  override async put(oracleId: string, report: SupportReport): Promise<void> {
    this.puts++;
    await super.put(oracleId, report);
  }
}

describe('support cache (SPEC test 30)', () => {
  test('the first call computes and stores, the second reads the cache', async () => {
    const cache = new CountingCache();
    const first = await cachedSupport(cache, SYNTHETIC_VANILLA, 1);
    const second = await cachedSupport(cache, SYNTHETIC_VANILLA, 1);
    expect(cache.puts).toBe(1);
    expect(second).toBe(first);
    expect(first.status).toBe('supported');
  });

  test('a cached report from another parser version is recomputed and replaced', async () => {
    const cache = new CountingCache();
    const old = await cachedSupport(cache, SYNTHETIC_KEYWORD_CREATURE, 1);
    expect(old.parserVersion).toBe(1);
    const fresh = await cachedSupport(cache, SYNTHETIC_KEYWORD_CREATURE, 2);
    expect(fresh.parserVersion).toBe(2);
    expect(cache.puts).toBe(2);
    expect((await cache.get(SYNTHETIC_KEYWORD_CREATURE.oracleId))?.parserVersion).toBe(2);
    await cachedSupport(cache, SYNTHETIC_KEYWORD_CREATURE, 2);
    expect(cache.puts).toBe(2);
  });

  test('a stale status is not trusted: a changed parser can flip it', async () => {
    const cache = new MemorySupportCache();
    const stale: SupportReport = {
      status: 'unsupported',
      parserVersion: PARSER_VERSION - 1,
      source: 'parser',
      unparsed: [],
      reasons: ['stale'],
    };
    await cache.put(SYNTHETIC_VANILLA.oracleId, stale);
    const report = await cachedSupport(cache, SYNTHETIC_VANILLA);
    expect(report.status).toBe('supported');
    expect(report.parserVersion).toBe(PARSER_VERSION);
  });

  test('a report cached while community definitions existed is not trusted (D-167)', async () => {
    const cache = new MemorySupportCache();
    // The shape that browsers stored then: a `definitionKey` and the source `community`.
    const legacy = {
      status: 'supported',
      parserVersion: PARSER_VERSION,
      source: 'community',
      definitionKey: 'community:abc:active',
      unparsed: [],
      reasons: [],
    } as unknown as SupportReport;
    await cache.put(SYNTHETIC_KEYWORD_CREATURE.oracleId, legacy);
    const report = await cachedSupport(cache, SYNTHETIC_KEYWORD_CREATURE);
    expect(report.source).toBe('parser');
    expect(report).not.toHaveProperty('definitionKey');
    expect(await cache.get(SYNTHETIC_KEYWORD_CREATURE.oracleId)).toBe(report);
  });

  test('the cache is keyed by oracle id', async () => {
    const cache = new MemorySupportCache();
    await cachedSupport(cache, SYNTHETIC_VANILLA);
    expect(await cache.get(SYNTHETIC_VANILLA.oracleId)).toBeDefined();
    expect(await cache.get(SYNTHETIC_KEYWORD_CREATURE.oracleId)).toBeUndefined();
  });
});

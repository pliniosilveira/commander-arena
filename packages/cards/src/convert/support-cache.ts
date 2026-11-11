import type { StoredCard, SupportReport } from '../types';
import { PARSER_VERSION } from '../version';
import { importCard } from './import-card';
import { DEFAULT_OVERRIDES, type OverrideRegistry } from './override';

/**
 * Where computed support reports are kept between sessions (IndexedDB in the app, memory in
 * tests), keyed by Scryfall `oracle_id`. Async because the real one is.
 */
export interface SupportCache {
  get(oracleId: string): Promise<SupportReport | undefined>;
  put(oracleId: string, report: SupportReport): Promise<void>;
}

export class MemorySupportCache implements SupportCache {
  private readonly reports = new Map<string, SupportReport>();

  async get(oracleId: string): Promise<SupportReport | undefined> {
    return this.reports.get(oracleId);
  }

  async put(oracleId: string, report: SupportReport): Promise<void> {
    this.reports.set(oracleId, report);
  }
}

/**
 * The support report for a card, from the cache only when it was computed with the same
 * `parserVersion`; otherwise it is recomputed with importCard and stored (SPEC test 30: after
 * PARSER_VERSION changes, cached statuses are recomputed). A report cached while community
 * definitions existed (removed in D-167) carries a `definitionKey`; it is recomputed too, so a card
 * that was supported only through a definition is not trusted any more.
 */
export async function cachedSupport(
  cache: SupportCache,
  stored: StoredCard,
  parserVersion: number = PARSER_VERSION,
  overrides: OverrideRegistry = DEFAULT_OVERRIDES,
): Promise<SupportReport> {
  const hit = await cache.get(stored.oracleId);
  if (hit !== undefined && hit.parserVersion === parserVersion && !('definitionKey' in hit)) {
    return hit;
  }
  const report = importCard(stored, parserVersion, overrides).support;
  await cache.put(stored.oracleId, report);
  return report;
}

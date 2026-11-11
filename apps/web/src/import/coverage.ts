/** Support numbers of an imported deck (SPEC 7.3 style, per deck). Pure. */
import { isBasicLand } from '@commander-arena/cards';
import type { Coverage, ImportedEntry } from './types';

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

function byName(a: ImportedEntry, b: ImportedEntry): number {
  const left = a.card.stored.name;
  const right = b.card.stored.name;
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Counts distinct cards and copies, supported and not. `percentNonbasic` is taken over the
 * distinct cards that are not basic lands (nonbasic lands, spells and commanders), the number that
 * says something about the deck; basic lands only count in `percentCopies`.
 */
export function computeCoverage(entries: readonly ImportedEntry[]): Coverage {
  const supported = (entry: ImportedEntry): boolean => entry.card.support.status === 'supported';
  // A card that is both commander and a main-deck duplicate is one distinct card.
  const distinct = new Map<string, ImportedEntry>();
  for (const entry of entries) {
    if (!distinct.has(entry.card.stored.oracleId)) distinct.set(entry.card.stored.oracleId, entry);
  }
  const cards = [...distinct.values()];
  const nonbasic = cards.filter((entry) => !isBasicLand(entry.card.stored));
  const copies = entries.reduce((sum, entry) => sum + entry.count, 0);
  const supportedCopies = entries.filter(supported).reduce((sum, entry) => sum + entry.count, 0);
  return {
    distinctCards: cards.length,
    supportedDistinct: cards.filter(supported).length,
    copies,
    supportedCopies,
    percentCopies: percent(supportedCopies, copies),
    percentNonbasic: percent(nonbasic.filter(supported).length, nonbasic.length),
    unsupported: cards.filter((entry) => !supported(entry)).sort(byName),
  };
}

// Shared types of the corpus tooling. Plain data only.

import type { ImportedCard } from '@commander-arena/cards';

/** What the reports need from every analysed card. */
export interface CardRecord {
  readonly name: string;
  /** EDHREC rank (lower is more popular), or null when Scryfall sends none. */
  readonly rank: number | null;
  readonly supported: boolean;
}

export interface CorpusResult {
  /** Base name of the input file, for the report header. */
  readonly source: string;
  readonly parserVersion: number;
  /** True when every card was kept, not only the Commander-legal ones (`--all`). */
  readonly allCards: boolean;
  /** Lines or array elements that were valid JSON and went through the converter. */
  readonly read: number;
  /** Lines or array elements that were not valid JSON: skipped. */
  readonly malformed: number;
  /** Valid JSON that is not a usable card (no id, oracle_id or name), or that made the import throw. */
  readonly rejected: number;
  /** Up to a handful of messages describing malformed and rejected entries, in file order. */
  readonly problems: readonly string[];
  /** Cards dropped by the Commander legality filter. */
  readonly notLegal: number;
  /** The analysed cards, in file order. */
  readonly cards: readonly CardRecord[];
  /** The analysed cards that are unsupported, in full, for the template analysis. */
  readonly unsupported: readonly ImportedCard[];
}

/** One supported-count over a population. */
export interface Share {
  readonly supported: number;
  readonly total: number;
}

export interface CoverageStats {
  readonly all: Share;
  readonly top500: Share;
  readonly top1000: Share;
  /** Cards with an EDHREC rank, and without (excluded from the two top lists). */
  readonly ranked: number;
  readonly unranked: number;
}

export function percent(share: Share): string {
  if (share.total === 0) return 'n/a';
  return `${((100 * share.supported) / share.total).toFixed(2)}%`;
}

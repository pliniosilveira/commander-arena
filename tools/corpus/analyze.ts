// Runs the card pipeline over a bulk file: raw object -> StoredCard -> ImportedCard, keeping the
// Commander-legal cards (or all with `--all`). The file is read as a stream; what stays in
// memory is one small record per card plus the full import result of the unsupported ones,
// which the template analysis needs.

import path from 'node:path';
import {
  type ImportedCard,
  importCard,
  PARSER_VERSION,
  parseStoredCard,
} from '@commander-arena/cards';
import { type CardItem, readCardObjects } from './read-cards.ts';
import type { CardRecord, CorpusResult } from './types.ts';

const MAX_PROBLEMS = 5;

export interface AnalyzeOptions {
  /** Keep every card, not only the Commander-legal ones. */
  readonly all?: boolean;
}

export async function analyzeFile(
  file: string,
  options: AnalyzeOptions = {},
  items: AsyncIterable<CardItem> = readCardObjects(file),
): Promise<CorpusResult> {
  const all = options.all === true;
  const cards: CardRecord[] = [];
  const unsupported: ImportedCard[] = [];
  const problems: string[] = [];
  let read = 0;
  let malformed = 0;
  let rejected = 0;
  let notLegal = 0;
  const note = (message: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push(message);
  };

  for await (const item of items) {
    if (item.kind === 'bad') {
      malformed += 1;
      note(`${item.where}: not valid JSON (${item.message})`);
      continue;
    }
    read += 1;
    // fetchedAt is 0: the reports must not depend on the clock.
    const converted = parseStoredCard(item.value, 0);
    if (converted.card === null) {
      rejected += 1;
      note(`card ${read}: ${converted.reason}`);
      continue;
    }
    const stored = converted.card;
    if (!all && stored.commanderLegality !== 'legal' && stored.commanderLegality !== 'restricted') {
      notLegal += 1;
      continue;
    }
    let imported: ImportedCard;
    try {
      imported = importCard(stored);
    } catch (error) {
      rejected += 1;
      note(`${stored.name}: the import threw (${error instanceof Error ? error.message : error})`);
      continue;
    }
    const supported = imported.support.status === 'supported';
    cards.push({ name: stored.name, rank: stored.edhrecRank, supported });
    if (!supported) unsupported.push(imported);
  }

  return {
    source: path.basename(file),
    parserVersion: PARSER_VERSION,
    allCards: all,
    read,
    malformed,
    rejected,
    problems,
    notLegal,
    cards,
    unsupported,
  };
}

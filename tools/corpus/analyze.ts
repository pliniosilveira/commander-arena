// Runs the card pipeline over a bulk file: raw object -> StoredCard -> ImportedCard, keeping the
// Commander-legal cards (or all with `--all`). The file is read as a stream; what stays in
// memory is one small record per card plus the full import result of the unsupported ones,
// which the template analysis needs.

import path from 'node:path';
import {
  type ImportedCard,
  importCard,
  type MeldLookup,
  meldRelation,
  normalizeNameKey,
  PARSER_VERSION,
  parseStoredCard,
  type StoredCard,
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

  // D-994: a meld card is read with its melded face, a card of its own that is not Commander-legal and may come later in the file than the half: the halves wait
  // until the whole file has been read, the melded faces are kept whatever their legality.
  const meldFaces = new Map<string, StoredCard>();
  const halves: StoredCard[] = [];
  const record = (stored: StoredCard, imported: ImportedCard) => {
    const supported = imported.support.status === 'supported';
    cards.push({ name: stored.name, rank: stored.edhrecRank, supported });
    if (!supported) unsupported.push(imported);
  };
  const importOne = (stored: StoredCard, related?: MeldLookup): ImportedCard | null => {
    try {
      return importCard(stored, undefined, undefined, undefined, undefined, related);
    } catch (error) {
      rejected += 1;
      note(`${stored.name}: the import threw (${error instanceof Error ? error.message : error})`);
      return null;
    }
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
    if (meldRelation(stored).role === 'result')
      meldFaces.set(normalizeNameKey(stored.name), stored);
    if (!all && stored.commanderLegality !== 'legal' && stored.commanderLegality !== 'restricted') {
      notLegal += 1;
      continue;
    }
    if (stored.layout === 'meld') {
      halves.push(stored);
      continue;
    }
    const imported = importOne(stored);
    if (imported !== null) record(stored, imported);
  }
  const related: MeldLookup = (name) => meldFaces.get(normalizeNameKey(name));
  for (const stored of halves) {
    const imported = importOne(stored, related);
    if (imported !== null) record(stored, imported);
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

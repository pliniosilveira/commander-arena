// The part of the workflow "Precon printings" that reads files: for each precon the app offers (`apps/web/src/precons/snapshots/*.json`), the same deck as
// Archidekt writes it now, with the printing of each card (`1x Name (set) number`, tools/precon/archidekt.ts). Only the `decklist` of a snapshot is rewritten,
// and only when the two lists have the same cards in the same counts: the stored card data is not touched, so no card needs support work. A deck whose list
// differs is left alone and reported (an update issue of "Precon issues" is the way to change a list).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readDeck } from '../corpus/decks.ts';
import { type Entry, isSameList, listDiff, sameDeck } from './archidekt.ts';

interface IndexEntry {
  readonly id: number;
  readonly name: string;
  readonly file: string;
}

export interface Outcome {
  readonly id: string;
  readonly status: 'updated' | 'unchanged' | 'different' | 'missing';
  readonly detail: string;
}

const entriesOf = (name: string, text: string): Entry[] =>
  readDeck(name, text).lines.map((l) => ({ name: l.name, count: l.count }));

/** The card lines of a list that name a printing, of all card lines. */
export function printingCount(text: string): { named: number; total: number } {
  const lines = text.split('\n').filter((l) => /^\d+x /.test(l.trim()));
  return {
    named: lines.filter((l) => /\s\([A-Za-z0-9]{2,6}\)\s/.test(l)).length,
    total: lines.length,
  };
}

/**
 * Rewrite the decklist of each snapshot in `snapshotsDir` with the list of the same deck in `decksDir` (what `scan-cli.ts` wrote), when the two have the same
 * cards and counts and the Archidekt list names printings. Returns what happened to each snapshot.
 */
export async function refreshPrintings(decksDir: string, snapshotsDir: string): Promise<Outcome[]> {
  const index = JSON.parse(
    await readFile(path.join(decksDir, 'index.json'), 'utf8'),
  ) as IndexEntry[];
  const scanned: { name: string; text: string; entries: Entry[] }[] = [];
  for (const deck of index) {
    const text = (await readFile(path.join(decksDir, deck.file), 'utf8')).trim();
    scanned.push({ name: deck.name, text, entries: entriesOf(deck.name, text) });
  }
  const outcomes: Outcome[] = [];
  for (const file of (await readdir(snapshotsDir)).filter((f) => f.endsWith('.json')).sort()) {
    const full = path.join(snapshotsDir, file);
    const snapshot = JSON.parse(await readFile(full, 'utf8')) as Record<string, unknown>;
    const id = typeof snapshot.id === 'string' ? snapshot.id : file.replace(/\.json$/, '');
    if (typeof snapshot.decklist !== 'string') continue;
    const ours = entriesOf(id, snapshot.decklist);
    const same = scanned.find((d) => isSameList(listDiff(ours, d.entries)));
    if (same === undefined) {
      const near = scanned.find((d) =>
        sameDeck(
          ours.map((e) => e.name),
          d.entries.map((e) => e.name),
        ),
      );
      outcomes.push(
        near === undefined
          ? { id, status: 'missing', detail: 'no deck of the Archidekt precons is this deck' }
          : {
              id,
              status: 'different',
              detail: `"${near.name}" has another list (an update issue changes a list)`,
            },
      );
      continue;
    }
    const { named, total } = printingCount(same.text);
    if (named === 0) {
      outcomes.push({
        id,
        status: 'unchanged',
        detail: 'Archidekt names no printing for this deck',
      });
    } else if (same.text === snapshot.decklist.trim()) {
      outcomes.push({
        id,
        status: 'unchanged',
        detail: `already has the printings (${named} of ${total} lines)`,
      });
    } else {
      await writeFile(full, `${JSON.stringify({ ...snapshot, decklist: same.text }, null, 2)}\n`);
      outcomes.push({
        id,
        status: 'updated',
        detail: `${named} of ${total} card lines name a printing`,
      });
    }
  }
  return outcomes;
}

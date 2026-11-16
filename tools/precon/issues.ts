// The part of the workflow "Precon issues" that needs the card pipeline: for each scanned deck, which cards the engine cannot fully run (the code of
// `pnpm corpus:decks`, so "supported" means what it means everywhere), and the issue each deck gets. Run through issues-cli.ts, which installs the hooks the
// pipeline's imports need.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeDeck, indexCards, readDeck, wantedKeys } from '../corpus/decks.ts';
import { readCardObjects } from '../corpus/read-cards.ts';
import { clean, type PreconIssue, preconIssue } from './archidekt.ts';

interface IndexEntry {
  readonly id: number;
  readonly name: string;
  readonly file: string;
  readonly cards: number;
}

/** The issues for the decks `scan-cli.ts` wrote into `dir`, judged against the bulk file `cards`. */
export async function buildIssues(dir: string, cards: string): Promise<PreconIssue[]> {
  const entries = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8')) as IndexEntry[];
  const decks = [];
  for (const entry of entries) {
    const text = await readFile(path.join(dir, entry.file), 'utf8');
    decks.push({ entry, deck: readDeck(entry.name, text), text });
  }
  const index = await indexCards(readCardObjects(cards), wantedKeys(decks.map((d) => d.deck)));
  if (index.read === 0)
    throw new Error('no card could be read: is this the oracle_cards bulk file?');
  const issues: PreconIssue[] = [];
  for (const { entry, deck, text } of decks) {
    const report = analyzeDeck(deck, index);
    const why = report.blocked.map((card) => {
      const lines = card.blockers.map(
        (b) => `- ${clean(b.text)} (${b.needs.map(clean).join('; ')})`,
      );
      return `### ${clean(card.name)}\n${lines.join('\n')}`;
    });
    issues.push(
      preconIssue({
        deck: { id: entry.id, name: entry.name, text: text.trimEnd(), cards: entry.cards },
        unsupported: report.blocked.map((card) => clean(card.name)),
        why,
        notFound: report.unresolved.map((card) => clean(card.name)),
      }),
    );
  }
  return issues;
}

export async function writeIssues(issues: readonly PreconIssue[], out: string): Promise<void> {
  await writeFile(out, `${JSON.stringify(issues, null, 2)}\n`);
}

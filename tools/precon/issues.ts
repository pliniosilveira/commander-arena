// The part of the workflow "Precon issues" that needs the card pipeline: for each scanned deck, which cards the engine cannot fully run (the code of
// `pnpm corpus:decks`, so "supported" means what it means everywhere), and the issue each deck gets. Run through issues-cli.ts, which installs the hooks the
// pipeline's imports need.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeDeck, indexCards, readDeck, wantedKeys } from '../corpus/decks.ts';
import { readCardObjects } from '../corpus/read-cards.ts';
import { clean, type PreconIssue, preconIssue, sameDeck } from './archidekt.ts';

interface IndexEntry {
  readonly id: number;
  readonly name: string;
  readonly file: string;
  readonly cards: number;
}

/** The decklists of the precons the app already offers (`apps/web/src/precons/snapshots/*.json`): name and the names of the cards. */
export async function installedDecks(
  dir: string,
): Promise<{ readonly name: string; readonly cards: readonly string[] }[]> {
  const found = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
    const snapshot = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as {
      name?: string;
      decklist?: string;
    };
    if (typeof snapshot.decklist !== 'string') continue;
    const parsed = readDeck(snapshot.name ?? file, snapshot.decklist);
    found.push({ name: snapshot.name ?? file, cards: parsed.lines.map((l) => l.name) });
  }
  return found;
}

export interface BuiltIssues {
  readonly issues: PreconIssue[];
  /** Decks the app already offers as a precon: no issue is opened for them. */
  readonly installed: readonly { readonly deck: string; readonly precon: string }[];
}

/**
 * The issues for the decks `scan-cli.ts` wrote into `dir`, judged against the bulk file `cards`. A deck that is the same as a precon of `installedDir`
 * (the same cards, `sameDeck`) gets no issue: the app already offers it, and what it has is the owner's to review, not a request.
 */
export async function buildIssues(
  dir: string,
  cards: string,
  installedDir?: string,
): Promise<BuiltIssues> {
  const installedDecksList = installedDir === undefined ? [] : await installedDecks(installedDir);
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
  const installed: { deck: string; precon: string }[] = [];
  for (const { entry, deck, text } of decks) {
    const names = deck.lines.map((l) => l.name);
    const already = installedDecksList.find((p) => sameDeck(names, p.cards));
    if (already !== undefined) {
      installed.push({ deck: entry.name, precon: already.name });
      continue;
    }
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
  return { issues, installed };
}

export async function writeIssues(issues: readonly PreconIssue[], out: string): Promise<void> {
  await writeFile(out, `${JSON.stringify(issues, null, 2)}\n`);
}

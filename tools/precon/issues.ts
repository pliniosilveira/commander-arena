// The part of the workflow "Precon issues" that needs the card pipeline: for each scanned deck, which cards the engine cannot fully run (the code of
// `pnpm corpus:decks`, so "supported" means what it means everywhere), and the issue each deck gets. Run through issues-cli.ts, which installs the hooks the
// pipeline's imports need.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeDeck, indexCards, readDeck, wantedKeys } from '../corpus/decks.ts';
import { readCardObjects } from '../corpus/read-cards.ts';
import {
  clean,
  type Entry,
  isSameList,
  listDiff,
  listHash,
  type PreconIssue,
  preconIssue,
  sameDeck,
} from './archidekt.ts';

interface IndexEntry {
  readonly id: number;
  readonly name: string;
  readonly file: string;
  readonly cards: number;
}

export interface InstalledDeck {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly Entry[];
}

/** The precons the app already offers (`apps/web/src/precons/snapshots/*.json`): id, name and the list of each. */
export async function installedDecks(dir: string): Promise<InstalledDeck[]> {
  const found: InstalledDeck[] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
    const snapshot = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as {
      id?: string;
      name?: string;
      decklist?: string;
    };
    if (typeof snapshot.decklist !== 'string') continue;
    const parsed = readDeck(snapshot.name ?? file, snapshot.decklist);
    found.push({
      id: snapshot.id ?? file.replace(/\.json$/, ''),
      name: snapshot.name ?? file,
      entries: parsed.lines.map((l) => ({ name: l.name, count: l.count })),
    });
  }
  return found;
}

export interface BuiltIssues {
  readonly issues: PreconIssue[];
  /** Decks the app already offers with the same list: no issue. */
  readonly upToDate: readonly { readonly deck: string; readonly precon: string }[];
}

/** The installed precon that is the same deck as `entries` (the most names in common, at least four fifths), or undefined. */
function matchInstalled(
  entries: readonly Entry[],
  installed: readonly InstalledDeck[],
): InstalledDeck | undefined {
  const names = entries.map((e) => e.name);
  let best: InstalledDeck | undefined;
  let bestShared = 0;
  for (const deck of installed) {
    if (
      !sameDeck(
        names,
        deck.entries.map((e) => e.name),
      )
    )
      continue;
    const theirs = new Set(deck.entries.map((e) => e.name.toLowerCase()));
    const shared = names.filter((n) => theirs.has(n.toLowerCase())).length;
    if (shared > bestShared) {
      best = deck;
      bestShared = shared;
    }
  }
  return best;
}

/**
 * The issues for the decks `scan-cli.ts` wrote into `dir`, judged against the bulk file `cards` and the precons the app offers (`installedDir`, from the
 * checked-out branch). A deck the app does not have gets an issue that asks for support and for the deck to be added; a deck the app has, but with another
 * list, gets an issue that asks for the precon to be updated; a deck the app has with the same list gets none.
 */
export async function buildIssues(
  dir: string,
  cards: string,
  installedDir?: string,
): Promise<BuiltIssues> {
  const installed = installedDir === undefined ? [] : await installedDecks(installedDir);
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
  const upToDate: { deck: string; precon: string }[] = [];
  for (const { entry, deck, text } of decks) {
    const list = deck.lines.map((l) => ({ name: l.name, count: l.count }));
    const match = matchInstalled(list, installed);
    const diff = match === undefined ? undefined : listDiff(match.entries, list);
    if (match !== undefined && diff !== undefined && isSameList(diff)) {
      upToDate.push({ deck: entry.name, precon: match.name });
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
        ...(match === undefined || diff === undefined
          ? {}
          : { installed: { id: match.id, name: match.name, diff, hash: listHash(list) } }),
      }),
    );
  }
  return { issues, upToDate };
}

export async function writeIssues(issues: readonly PreconIssue[], out: string): Promise<void> {
  await writeFile(out, `${JSON.stringify(issues, null, 2)}\n`);
}

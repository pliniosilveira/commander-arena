// `pnpm corpus:decks`: per-deck coverage over a bulk file. Run through cli.ts (main.ts dispatches
// here); it imports the card pipeline, which needs the resolution hooks.

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PARSER_VERSION } from '@commander-arena/cards';
import type { Options } from './args.ts';
import { analyzeDeck, indexCards, type ParsedDeck, readDeck, wantedKeys } from './decks.ts';
import { readCardObjects } from './read-cards.ts';
import { type DecksResult, renderDecks, summaryLines } from './render-decks.ts';

interface Io {
  out(text: string): void;
  err(text: string): void;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The decklist files behind the --deck arguments: a folder stands for its .txt files. */
async function deckFiles(args: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const arg of args) {
    const target = path.resolve(arg);
    if ((await stat(target)).isDirectory()) {
      const names = (await readdir(target)).filter((name) => name.toLowerCase().endsWith('.txt'));
      for (const name of names.sort(compare)) files.push(path.join(target, name));
    } else {
      files.push(target);
    }
  }
  return files;
}

export async function runDecks(options: Options, repoRoot: string, io: Io): Promise<number> {
  const file = path.resolve(options.file ?? '');
  const target = path.resolve(options.out ?? path.join(repoRoot, 'reports/decks.md'));

  const decks: ParsedDeck[] = [];
  try {
    for (const deckFile of await deckFiles(options.decks)) {
      const name = path.basename(deckFile, path.extname(deckFile));
      if (decks.some((deck) => deck.name === name)) {
        io.err(`error: two decks are called "${name}"; rename one of the files`);
        return 2;
      }
      decks.push(readDeck(name, await readFile(deckFile, 'utf8')));
    }
  } catch (error) {
    io.err(`error: cannot read a decklist: ${error instanceof Error ? error.message : error}`);
    return 2;
  }
  if (decks.length === 0) {
    io.err('error: no decklist found (a folder given to --deck needs .txt files)');
    return 2;
  }
  decks.sort((a, b) => compare(a.name, b.name));

  io.out(`Reading ${file} ...`);
  let index: Awaited<ReturnType<typeof indexCards>>;
  try {
    index = await indexCards(readCardObjects(file), wantedKeys(decks));
  } catch (error) {
    io.err(`error: cannot read ${file}: ${error instanceof Error ? error.message : error}`);
    return 2;
  }
  if (index.read === 0) {
    io.err('error: no card could be read; is this the oracle_cards bulk file?');
    return 2;
  }
  io.out(
    `${index.read} cards read; ${index.malformed} malformed line(s) skipped, ${index.rejected} rejected.`,
  );

  const result: DecksResult = {
    source: path.basename(file),
    parserVersion: PARSER_VERSION,
    decks: decks.map((deck) => analyzeDeck(deck, index)),
  };
  for (const line of summaryLines(result)) io.out(line);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, renderDecks(result));
  const relative = path.relative(process.cwd(), target);
  io.out(`wrote ${relative.startsWith('..') ? target : relative}`);
  return 0;
}

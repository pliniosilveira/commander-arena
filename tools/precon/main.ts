// `pnpm precon:snapshot`: the card-data snapshot of one precon, from Scryfall's bulk file.
// Run through cli.ts: this module imports the card pipeline, which needs the resolution hooks.
//
// Names are resolved with the code of `pnpm corpus:decks` (tools/corpus/decks.ts), which matches
// them the way deck import does. The cards are written in the format the import cache holds
// (`StoredCard`, SPEC 6.2) by the snapshot module of the cards package, which the web app reads.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ImportedCard,
  meldResultNames,
  normalizeNameKey,
  type PreconSnapshot,
  type StoredCard,
  serializePreconSnapshot,
  toSnapshotCard,
  validateDeck,
} from '@commander-arena/cards';
import {
  type CardIndex,
  indexCards,
  lookup,
  type ParsedDeck,
  readDeck,
  wantedKeys,
} from '../corpus/decks.ts';
import { readCardObjects } from '../corpus/read-cards.ts';
import { type Options, parseOptions, USAGE } from './args.ts';

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

export interface Deps {
  /** The repository root: where apps/web/src/precons/snapshots/ lives by default. */
  readonly repoRoot: string;
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface Resolved {
  readonly cards: ReadonlyMap<string, ImportedCard>;
  readonly missing: readonly string[];
}

/** Every card the decklist names, once by oracle id; and the names no card of the file matched. */
function resolveDeck(deck: ParsedDeck, index: CardIndex): Resolved {
  const cards = new Map<string, ImportedCard>();
  const missing = new Set<string>();
  for (const line of deck.lines) {
    const card = lookup(index, line.name);
    if (card === undefined) missing.add(line.name);
    else cards.set(card.stored.oracleId, card);
  }
  return { cards, missing: [...missing].sort(compare) };
}

/** Warnings about a deck that the web app would refuse to start (D-056, CR 903.5). */
function warningsFor(deck: ParsedDeck, index: CardIndex): string[] {
  const warnings: string[] = [];
  const counts = new Map<string, { card: ImportedCard; count: number }>();
  const commanders: ImportedCard[] = [];
  for (const line of deck.lines) {
    const card = lookup(index, line.name);
    if (card === undefined) continue;
    if (line.section === 'commander') {
      if (!commanders.includes(card)) commanders.push(card);
      if (line.count > 1) counts.set(card.stored.oracleId, { card, count: line.count - 1 });
      continue;
    }
    const known = counts.get(card.stored.oracleId);
    counts.set(card.stored.oracleId, { card, count: (known?.count ?? 0) + line.count });
  }
  const distinct = new Map<string, ImportedCard>();
  for (const card of [...commanders, ...[...counts.values()].map((entry) => entry.card)]) {
    distinct.set(card.stored.oracleId, card);
  }
  const unsupported = [...distinct.values()]
    .filter((card) => card.support.status !== 'supported')
    .map((card) => card.stored.name)
    .sort(compare);
  if (unsupported.length > 0) {
    warnings.push(`cards the engine cannot fully run: ${unsupported.join(', ')}`);
  }
  if (commanders.length === 0) {
    warnings.push('the decklist has no Commander section, so the deck is not checked');
    return warnings;
  }
  const check = validateDeck({
    commanders: commanders.map((card) => card.stored),
    main: [...counts.values()].map(({ card, count }) => ({ card: card.stored, count })),
  });
  for (const issue of check.issues) {
    if (issue.severity === 'error') warnings.push(`${issue.code}: ${issue.message}`);
  }
  return warnings;
}

/** Runs the command and returns the exit code: 0 written, 1 unresolved names, 2 bad input. */
export async function run(argv: readonly string[], io: Io, deps: Deps): Promise<number> {
  const options: Options | string = parseOptions(argv);
  if (typeof options === 'string') {
    io.err(`error: ${options}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    io.out(USAGE);
    return 0;
  }

  let decklist: string;
  try {
    decklist = await readFile(path.resolve(options.deck), 'utf8');
  } catch (error) {
    io.err(`error: cannot read ${options.deck}: ${error instanceof Error ? error.message : error}`);
    return 2;
  }
  const deck = readDeck(options.id, decklist);
  if (deck.lines.length === 0) {
    io.err(`error: ${options.deck} has no cards`);
    return 2;
  }
  if (deck.errors.length > 0) {
    io.err(`error: ${options.deck} has lines that could not be read; nothing was written:`);
    for (const message of deck.errors) io.err(`  ${message}`);
    return 1;
  }

  const file = path.resolve(options.file);
  io.out(`Reading ${file} ...`);
  let index: Awaited<ReturnType<typeof indexCards>>;
  try {
    index = await indexCards(readCardObjects(file), wantedKeys([deck]));
  } catch (error) {
    io.err(`error: cannot read ${file}: ${error instanceof Error ? error.message : error}`);
    return 2;
  }
  if (index.read === 0) {
    io.err('error: no card could be read; is this the oracle_cards bulk file?');
    return 2;
  }

  const resolved = resolveDeck(deck, index);
  if (resolved.missing.length > 0) {
    io.err(`error: ${resolved.missing.length} name(s) are not in ${path.basename(file)}:`);
    for (const name of resolved.missing) io.err(`  ${name}`);
    io.err('nothing was written');
    return 1;
  }

  // D-280: a meld card needs its melded face, a card of its own that is not in the decklist: the snapshot stores it with the cards, so the precon is played offline.
  const faces: StoredCard[] = [];
  const noFace: string[] = [];
  for (const name of meldResultNames([...resolved.cards.values()].map((c) => c.stored))) {
    const face = index.meldFaces.get(normalizeNameKey(name));
    if (face === undefined) noFace.push(name);
    else faces.push(face);
  }
  if (noFace.length > 0) {
    io.err(
      `error: the melded face of a meld card is not in ${path.basename(file)}: ${noFace.join('; ')}`,
    );
    io.err('nothing was written');
    return 1;
  }

  const snapshot: PreconSnapshot = {
    id: options.id,
    name: options.name,
    blurb: options.blurb,
    source: path.basename(file),
    decklist,
    cards: [...resolved.cards.values()]
      .map((card) => card.stored)
      .concat(faces)
      .map(toSnapshotCard),
  };
  const dir = path.resolve(
    options.out ?? path.join(deps.repoRoot, 'apps/web/src/precons/snapshots'),
  );
  const target = path.join(dir, `${options.id}.json`);
  await mkdir(dir, { recursive: true });
  await writeFile(target, serializePreconSnapshot(snapshot));
  const relative = path.relative(process.cwd(), target);
  io.out(`wrote ${relative.startsWith('..') ? target : relative} (${snapshot.cards.length} cards)`);
  for (const warning of warningsFor(deck, index)) io.out(`warning: ${warning}`);
  return 0;
}

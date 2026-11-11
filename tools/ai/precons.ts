// The real precon decks for the AI tools (M7d, D-164): the snapshots of apps/web/src/precons/snapshots
// turned into engine decks by the SAME pipeline the web app uses for a precon (apps/web/src/precons/
// build.ts): parse the snapshot, resolve the decklist through a client that answers from the
// snapshot's own cards, convert every card with its support status, validate, and accept the deck
// only when `checkPlayable` does. Nothing here is hand-written card data; a precon the web app would
// refuse is reported as a problem and left out.
//
// build.ts itself cannot be loaded by Node (its sibling snapshots.ts reads the folder with Vite's
// `import.meta.glob`), so the few lines of `buildPreconDeck` are repeated here on top of the same web
// modules: `createImportService`, `checkPlayable` and `snapshotClient`. The fixtures are the only
// overrides, as in the page.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OVERRIDES,
  MemorySupportCache,
  type PreconSnapshot,
  parsePreconSnapshot,
} from '@commander-arena/cards';
import type { DeckConfig } from '@commander-arena/engine';
import { checkPlayable } from '../../apps/web/src/import/deck.ts';
import { createImportService } from '../../apps/web/src/import/service.ts';
import { snapshotClient } from '../../apps/web/src/precons/snapshot-client.ts';

/** Where the snapshots live (the web app's own folder). */
export const SNAPSHOT_FOLDER = fileURLToPath(
  new URL('../../apps/web/src/precons/snapshots/', import.meta.url),
);

export interface PreconDeckEntry {
  readonly id: string;
  readonly name: string;
  readonly deck: DeckConfig;
}

export interface LoadedPrecons {
  /** The decks that are valid and fully supported, sorted by id. */
  readonly decks: readonly PreconDeckEntry[];
  /** One line per snapshot that could not be read or that the web app would refuse to start. */
  readonly problems: readonly string[];
}

/** The snapshots of a folder, sorted by file name; a bad file is reported, never guessed at. */
export function readSnapshots(folder: string = SNAPSHOT_FOLDER): {
  snapshots: PreconSnapshot[];
  problems: string[];
} {
  const snapshots: PreconSnapshot[] = [];
  const problems: string[] = [];
  for (const file of readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    try {
      const parsed = parsePreconSnapshot(JSON.parse(readFileSync(path.join(folder, file), 'utf8')));
      if (!parsed.ok) problems.push(`${file}: ${parsed.error}`);
      else snapshots.push(parsed.snapshot);
    } catch (error) {
      problems.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { snapshots, problems };
}

/** The engine deck of one snapshot, or the reason the web app would refuse it. */
export async function buildDeck(
  snapshot: PreconSnapshot,
): Promise<{ ok: true; deck: DeckConfig } | { ok: false; reason: string }> {
  const service = createImportService({
    client: snapshotClient(snapshot.cards),
    supportCache: new MemorySupportCache(),
    overrides: DEFAULT_OVERRIDES,
  });
  const report = await service.run({ text: snapshot.decklist, deckName: snapshot.name });
  const check = checkPlayable(report);
  return check.ok
    ? { ok: true, deck: check.deck }
    : { ok: false, reason: `"${snapshot.name}" cannot be played: ${check.reason}.` };
}

export async function loadPreconDecks(folder: string = SNAPSHOT_FOLDER): Promise<LoadedPrecons> {
  const { snapshots, problems } = readSnapshots(folder);
  const decks: PreconDeckEntry[] = [];
  for (const snapshot of snapshots) {
    const built = await buildDeck(snapshot);
    if (built.ok) decks.push({ id: snapshot.id, name: snapshot.name, deck: built.deck });
    else problems.push(built.reason);
  }
  return { decks, problems };
}

/** The same deck on both seats, one entry per precon: "mirrored pairs" (`MatchOptions.decks`). */
export function mirrorPairs(decks: readonly PreconDeckEntry[]): DeckConfig[] {
  return decks.map((d) => d.deck);
}

/**
 * Every ordered pair of two different precons, `[seat 0 deck, seat 1 deck]`: "precon-against-precon
 * pairs". With n decks that is n * (n - 1) pairs, in the order of the ids.
 */
export function crossPairs(decks: readonly PreconDeckEntry[]): [DeckConfig, DeckConfig][] {
  const pairs: [DeckConfig, DeckConfig][] = [];
  for (const x of decks) for (const y of decks) if (x !== y) pairs.push([x.deck, y.deck]);
  return pairs;
}

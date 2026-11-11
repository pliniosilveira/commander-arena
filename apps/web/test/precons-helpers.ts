/**
 * Helpers of the precon tests. Everything here is SYNTHETIC: the cards come from the SYNTHETIC
 * Scryfall of the import tests (invented "Synthetic ..." names), never real card data, and the
 * precons built from them are not real precons.
 */
import {
  createScryfallClient,
  MemoryCardCache,
  MemorySupportCache,
  type PreconSnapshot,
  toSnapshotCard,
} from '@commander-arena/cards';
import { createImportService } from '../src/import';
import { createPrecons, type Precons, type ServiceFor } from '../src/precons';
import { createFakeScryfall, createVirtualClock } from './import-fake-scryfall';
import { hundredCardText, supportedHundredText } from './import-helpers';

/** The names of a decklist written as "Commander / Deck" sections of "N Name" lines. */
function namesOf(text: string): string[] {
  const names = new Set<string>();
  for (const line of text.split('\n')) {
    const match = /^\d+\s+(.+)$/.exec(line.trim());
    if (match?.[1] !== undefined) names.add(match[1]);
  }
  return [...names];
}

/** A snapshot of a SYNTHETIC decklist: its cards come from the SYNTHETIC Scryfall. */
export async function syntheticSnapshot(
  id: string,
  decklist: string,
  name = `SYNTHETIC precon ${id}`,
): Promise<PreconSnapshot> {
  const clock = createVirtualClock();
  const client = createScryfallClient({
    fetch: createFakeScryfall().fetch,
    now: clock.now,
    sleep: clock.sleep,
    cache: new MemoryCardCache({ now: clock.now }),
  });
  const resolved = await client.resolveNames(namesOf(decklist));
  const unique = new Map(
    [...resolved.found.values()].map((card) => [card.oracleId, toSnapshotCard(card)]),
  );
  return {
    id,
    name,
    blurb: 'A SYNTHETIC deck for the tests.',
    source: 'synthetic.jsonl.gz',
    decklist,
    cards: [...unique.values()],
  };
}

/** A legal 100-card list of supported SYNTHETIC cards (D-056). */
export const playableSnapshot = (id = 'synthetic-playable') =>
  syntheticSnapshot(id, `${supportedHundredText()}\n`);

/** The same list with seven cards the engine cannot run yet. */
export const unsupportedSnapshot = (id = 'synthetic-unsupported') =>
  syntheticSnapshot(id, `${hundredCardText()}\n`);

/** The import service of the app, as `createImportEnvironment` makes it, over a given client. */
export const serviceFor: ServiceFor = (client) =>
  createImportService({ client, supportCache: new MemorySupportCache() });

export function preconsOf(snapshots: readonly PreconSnapshot[]): Precons {
  return createPrecons(snapshots, serviceFor);
}

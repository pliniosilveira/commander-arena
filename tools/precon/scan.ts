// The network part of the workflow "Precon issues": reads Archidekt's list of Commander precons and each deck's API answer. The fetch, the pause and the log are
// parameters, so a test runs it with none of them real. A deck that cannot be read is logged and left out, never guessed.

import { ARCHIDEKT, type ArchidektDeck, deckFromApi, deckIdsFromListing } from './archidekt.ts';

export interface ScanOptions {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly log: (line: string) => void;
  /** Ids to read instead of the ones the listing page links to. */
  readonly ids?: readonly number[];
  /** At most this many decks (0 or absent: all). */
  readonly limit?: number;
  /** Milliseconds between two requests. */
  readonly delayMs: number;
  /** A precon has a commander and 99 cards; a deck with another count is left out unless this is set. */
  readonly anySize?: boolean;
}

const HEADERS = {
  'User-Agent': 'commander-arena-precon-scan (+https://github.com/pliniosilveira/commander-arena)',
  Accept: 'application/json, text/html;q=0.9',
};

async function get(options: ScanOptions, url: string): Promise<Response> {
  const response = await options.fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GET ${url} answered HTTP ${response.status}`);
  return response;
}

/** The decks of the listing page, each read from its API answer. Throws when no deck page is linked. */
export async function scanArchidekt(options: ScanOptions): Promise<ArchidektDeck[]> {
  let ids = [...(options.ids ?? [])];
  if (ids.length === 0) {
    const listing = `${ARCHIDEKT}/commander-precons`;
    const page = await (await get(options, listing)).text();
    ids = deckIdsFromListing(page);
    options.log(`${listing}: ${page.length} characters, ${ids.length} deck link(s).`);
    if (ids.length === 0) {
      options.log(`No deck link in the page. Its start:\n${page.slice(0, 3000)}`);
      throw new Error(
        'the listing page links to no deck: its layout changed, or it is drawn by script',
      );
    }
  }
  if ((options.limit ?? 0) > 0) ids = ids.slice(0, options.limit);
  const decks: ArchidektDeck[] = [];
  for (const id of ids) {
    await options.sleep(options.delayMs);
    try {
      const answer: unknown = await (await get(options, `${ARCHIDEKT}/api/decks/${id}/`)).json();
      const deck = deckFromApi(id, answer);
      if (typeof deck === 'string') {
        options.log(`skipped: ${deck}`);
      } else if (options.anySize !== true && deck.cards !== 100) {
        options.log(
          `skipped: deck ${id} "${deck.name}" has ${deck.cards} cards, a precon has 100 (${deck.breakdown})`,
        );
      } else {
        options.log(`deck ${id}: "${deck.name}", ${deck.cards} cards`);
        decks.push(deck);
      }
    } catch (error) {
      options.log(`skipped: deck ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return decks;
}

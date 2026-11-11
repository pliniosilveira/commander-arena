/**
 * Wires the import feature for the browser: the Scryfall client with its IndexedDB cache, the
 * support cache, the import service and the deck store. This is the page, not the
 * engine, so real `fetch`, `Date.now` and `setTimeout` are the defaults here; tests inject their
 * own.
 */
import {
  createScryfallClient,
  DEFAULT_OVERRIDES,
  type ScryfallClient,
  type ScryfallFetch,
} from '@commander-arena/cards';
import { AppDatabase, defaultFactory, IdbCardCache, IdbDeckStore, IdbSupportCache } from './idb';
import { createImportService } from './service';
import type { ImportEnvironment, ImportService } from './types';

export interface ImportEnvironmentOptions {
  readonly fetch?: ScryfallFetch;
  /** Milliseconds since the epoch. Default `Date.now`. */
  readonly now?: () => number;
  /** Default `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** The IndexedDB factory; `null` forces the in-memory fallback. Default the page's. */
  readonly idb?: IDBFactory | null;
}

/** The environment of the page: also makes import services that read cards from another source. */
export interface BrowserImportEnvironment extends ImportEnvironment {
  /** The Scryfall client of the page (with its IndexedDB card cache): the library of decks reads from it (D-215). */
  readonly client: ScryfallClient;
  /**
   * An import service like `service`, with the same support cache, overrides (the engine's
   * fixtures) and parser version, resolving names through `client`. The precons use it with a
   * client that answers from their snapshot (D-137).
   */
  serviceFor(client: ScryfallClient): ImportService;
}

export function createImportEnvironment(
  options: ImportEnvironmentOptions = {},
): BrowserImportEnvironment {
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // Late-bound so a replaced global fetch (tests, extensions) is the one used.
  const fetchFn: ScryfallFetch =
    options.fetch ?? ((url, init) => globalThis.fetch.bind(globalThis)(url, init));
  const database = new AppDatabase(options.idb === undefined ? defaultFactory() : options.idb);

  const client = createScryfallClient({
    fetch: fetchFn,
    now,
    sleep,
    cache: new IdbCardCache(database, now),
  });
  const serviceFor = (source: ScryfallClient): ImportService =>
    createImportService({
      client: source,
      supportCache: new IdbSupportCache(database),
      overrides: DEFAULT_OVERRIDES,
    });
  const service = serviceFor(client);
  const decks = new IdbDeckStore(database, now);

  return {
    service,
    client,
    serviceFor,
    decks,
  };
}

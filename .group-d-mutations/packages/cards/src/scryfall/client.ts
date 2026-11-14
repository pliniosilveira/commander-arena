/**
 * The Scryfall client of the app (SPEC 6.2): name resolution through one shared request queue.
 * The fetch function, the clock and `sleep` are injected, so the client runs in the browser, in a
 * Worker, in Node tools and in tests.
 */
import type { CardCache } from './cache';
import { createRequestQueue, type RequestQueue, type ScryfallFetch } from './queue';
import { type ResolveResult, resolveNames } from './resolve';

export interface ScryfallClientOptions {
  readonly fetch: ScryfallFetch;
  /** Milliseconds since the epoch. */
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly cache?: CardCache | undefined;
  /** Sent as `User-Agent`; for Node tools only (browsers ignore it). */
  readonly userAgent?: string | undefined;
  /** Share a queue between clients. By default the client creates its own, once. */
  readonly queue?: RequestQueue | undefined;
}

export interface ScryfallClient {
  /** Never throws: trouble with a name is reported in `failures`. */
  resolveNames(names: readonly string[]): Promise<ResolveResult>;
}

export function createScryfallClient(options: ScryfallClientOptions): ScryfallClient {
  const queue =
    options.queue ??
    createRequestQueue({
      fetch: options.fetch,
      now: options.now,
      sleep: options.sleep,
      userAgent: options.userAgent,
    });

  return {
    resolveNames: (names) => resolveNames({ queue, cache: options.cache, now: options.now }, names),
  };
}

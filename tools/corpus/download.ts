// Fetches Scryfall's `oracle_cards` bulk file into a local cache (D-048). This is the only module
// that touches the network, and the owner runs it locally: the sandbox blocks the host.
//
//   1. GET https://api.scryfall.com/bulk-data lists the files; pick the `oracle_cards` entry.
//   2. Stream its `jsonl_download_uri` (gzipped JSON Lines, about 25 MB) to the cache directory.
//
// Scryfall asks every client for an `Accept` header and a descriptive `User-Agent`. The file is
// stored as received; read-cards.ts decompresses it while reading, and recognises plain text too,
// in case a proxy already decoded it.

import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export const BULK_LIST_URL = 'https://api.scryfall.com/bulk-data';
export const USER_AGENT =
  'CommanderArena-corpus/0.0.0 (+https://github.com/pliniosilveira/commander-arena)';
const HEADERS = { Accept: 'application/json', 'User-Agent': USER_AGENT } as const;
const LIST_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

export interface BulkEntry {
  readonly updatedAt: string;
  readonly compressedSize: number | null;
  readonly downloadUri: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The `oracle_cards` entry of a /bulk-data response, or an Error that says what was missing. */
export function pickOracleCards(listing: unknown): BulkEntry | Error {
  const data = asRecord(listing)?.data;
  if (!Array.isArray(data)) return new Error('the /bulk-data response has no data list');
  const entry = data.map(asRecord).find((item) => item?.type === 'oracle_cards');
  if (entry === undefined) return new Error('the /bulk-data list has no oracle_cards entry');
  const uri = entry.jsonl_download_uri;
  if (typeof uri !== 'string' || uri === '') {
    return new Error(
      'the oracle_cards entry has no jsonl_download_uri (D-048 recorded that field; ' +
        'Scryfall may have changed the format)',
    );
  }
  const updated = typeof entry.updated_at === 'string' ? entry.updated_at : 'unknown-date';
  const size = entry.compressed_size;
  return {
    updatedAt: updated,
    compressedSize: typeof size === 'number' ? size : null,
    downloadUri: uri,
  };
}

/** A cache file name that changes when Scryfall publishes a new file. */
export function cacheFileName(entry: BulkEntry): string {
  return `oracle_cards-${entry.updatedAt.replace(/[^0-9A-Za-z]+/g, '-')}.jsonl.gz`;
}

export interface DownloadOptions {
  readonly cacheDir: string;
  readonly fetch?: typeof fetch;
  readonly log: (message: string) => void;
}

/** Downloads the file (unless the cache already holds this version) and returns its path. */
export async function downloadOracleCards(options: DownloadOptions): Promise<string> {
  const doFetch = options.fetch ?? fetch;
  const listing = await doFetch(BULK_LIST_URL, {
    headers: HEADERS,
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
  if (!listing.ok) throw new Error(`GET ${BULK_LIST_URL} answered HTTP ${listing.status}`);
  const entry = pickOracleCards(await listing.json());
  if (entry instanceof Error) throw entry;

  await mkdir(options.cacheDir, { recursive: true });
  const target = path.join(options.cacheDir, cacheFileName(entry));
  const cached = await stat(target).catch(() => null);
  if (cached !== null && (entry.compressedSize === null || cached.size === entry.compressedSize)) {
    options.log(`Using the cached file ${target} (Scryfall updated_at ${entry.updatedAt}).`);
    return target;
  }

  const size = entry.compressedSize === null ? 'unknown size' : `${entry.compressedSize} bytes`;
  options.log(`Downloading ${entry.downloadUri} (${size}) to ${target} ...`);
  const response = await doFetch(entry.downloadUri, {
    headers: HEADERS,
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || response.body === null) {
    throw new Error(`GET ${entry.downloadUri} answered HTTP ${response.status}`);
  }
  const partial = `${target}.part`;
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
      createWriteStream(partial),
    );
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  return target;
}

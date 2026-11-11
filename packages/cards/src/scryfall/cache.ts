/**
 * The card cache interface of the Scryfall client (SPEC 6.2: cache for at least 24 hours) and an
 * in-memory implementation. Keys are normalized lower-case card names (`normalizeNameKey`) and
 * oracle ids. The web app adds an IndexedDB implementation of the same interface.
 */
import type { StoredCard } from '../types';

export interface CardCache {
  /** The cached card, or undefined when there is none or it has expired. */
  get(key: string): Promise<StoredCard | undefined>;
  put(key: string, card: StoredCard): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface MemoryCardCacheOptions {
  /** The injected clock, in milliseconds. */
  readonly now: () => number;
  /** How long an entry lives, counted from `put`. Default 24 hours. */
  readonly ttlMs?: number | undefined;
}

export class MemoryCardCache implements CardCache {
  private readonly entries = new Map<string, { card: StoredCard; storedAt: number }>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: MemoryCardCacheOptions) {
    this.now = options.now;
    this.ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async get(key: string): Promise<StoredCard | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.storedAt >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.card;
  }

  async put(key: string, card: StoredCard): Promise<void> {
    this.entries.set(key, { card, storedAt: this.now() });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

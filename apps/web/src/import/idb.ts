/**
 * IndexedDB for the import feature: a small promise wrapper and the stores built on it. Browser
 * only (the page may use real time and the DOM; the engine may not).
 *
 * Every operation fails soft. When IndexedDB is missing or blocked (private window, blocked site
 * data, a quota error), the store switches to the in-memory copy it keeps of everything written in
 * this session and keeps working; nothing here throws into the UI.
 *
 * Database `commander-arena`, version 2, object stores with out-of-line string keys:
 * `cards` (name or oracle id to card + time), `support` (oracle id to support report),
 * `decks` (id). Earlier builds also had an `overrides` store (pasted community card definitions,
 * removed in D-167) and a `requests` store (card support requests, removed in D-166); a browser that
 * has either keeps it, unused, and the version stays 2 so those databases still open. A new version
 * only adds stores in `onupgradeneeded`, creating the ones that are missing, so what an older
 * version stored survives (D-053).
 */
import type { CardCache, SupportCache, SupportReport } from '@commander-arena/cards';
import { type CachedCardRecord, type Kv, KvCardCache, KvDeckStore, KvSupportCache } from './stores';
import type { SavedDeck } from './types';

export const DATABASE_NAME = 'commander-arena';
export const DATABASE_VERSION = 2;
export const STORE_NAMES = ['cards', 'support', 'decks'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted'));
  });
}

/** The page's IndexedDB factory, or null when the browser has none or blocks access to it. */
export function defaultFactory(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

/** One lazily opened connection shared by all stores; `open()` resolves null when unavailable. */
export class AppDatabase {
  private opened: Promise<IDBDatabase | null> | null = null;

  constructor(private readonly factory: IDBFactory | null) {}

  open(): Promise<IDBDatabase | null> {
    this.opened ??= this.connect();
    return this.opened;
  }

  private connect(): Promise<IDBDatabase | null> {
    const factory = this.factory;
    if (factory === null) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (db: IDBDatabase | null): void => {
        if (settled) {
          db?.close();
          return;
        }
        settled = true;
        resolve(db);
      };
      try {
        const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of STORE_NAMES) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          // Let a newer version of the page upgrade the database instead of blocking it.
          db.onversionchange = () => db.close();
          finish(db);
        };
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    });
  }
}

/**
 * A key-value store over one object store with the fail-soft behavior described above. Writes go
 * to memory first, so the session keeps its data even when IndexedDB stops working half way.
 */
export function createIdbKv<V>(database: AppDatabase, storeName: StoreName): Kv<V> {
  const memory = new Map<string, V>();
  let usable = true;

  async function run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest,
    fallback: () => T,
  ): Promise<T> {
    if (!usable) return fallback();
    try {
      const db = await database.open();
      if (db === null) {
        usable = false;
        return fallback();
      }
      const transaction = db.transaction(storeName, mode);
      const done = finished(transaction);
      done.catch(() => undefined);
      const result = await settle(action(transaction.objectStore(storeName)));
      if (mode === 'readwrite') await done;
      return result;
    } catch {
      usable = false;
      return fallback();
    }
  }

  return {
    get: (key) =>
      run<unknown>(
        'readonly',
        (store) => store.get(key),
        () => memory.get(key),
      ).then((value) => value as V | undefined),
    async put(key, value) {
      memory.set(key, value);
      await run<unknown>(
        'readwrite',
        (store) => store.put(value, key),
        () => undefined,
      );
    },
    async delete(key) {
      memory.delete(key);
      await run<unknown>(
        'readwrite',
        (store) => store.delete(key),
        () => undefined,
      );
    },
    async clear() {
      memory.clear();
      await run<unknown>(
        'readwrite',
        (store) => store.clear(),
        () => undefined,
      );
    },
    values: () =>
      run<unknown[]>(
        'readonly',
        (store) => store.getAll(),
        () => [...memory.values()],
      ).then((values) => values as V[]),
  };
}

export class IdbCardCache extends KvCardCache implements CardCache {
  constructor(database: AppDatabase, now: () => number, ttlMs?: number) {
    super(createIdbKv<CachedCardRecord>(database, 'cards'), now, ttlMs);
  }
}

export class IdbSupportCache extends KvSupportCache implements SupportCache {
  constructor(database: AppDatabase) {
    super(createIdbKv<SupportReport>(database, 'support'));
  }
}

export class IdbDeckStore extends KvDeckStore {
  constructor(database: AppDatabase, now: () => number) {
    super(createIdbKv<SavedDeck>(database, 'decks'), now);
  }
}

/**
 * The stores of the import feature on top of a tiny key-value interface, so the same logic runs
 * over IndexedDB (`idb.ts`), over memory (the fallback and the tests) or over anything else.
 */
import {
  type CardCache,
  DEFAULT_CACHE_TTL_MS,
  type StoredCard,
  type SupportCache,
  type SupportReport,
} from '@commander-arena/cards';
import type { DeckStoreApi, SavedDeck } from './types';

export interface Kv<V> {
  get(key: string): Promise<V | undefined>;
  put(key: string, value: V): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  values(): Promise<V[]>;
}

export function createMemoryKv<V>(): Kv<V> {
  const map = new Map<string, V>();
  return {
    get: async (key) => map.get(key),
    put: async (key, value) => {
      map.set(key, value);
    },
    delete: async (key) => {
      map.delete(key);
    },
    clear: async () => {
      map.clear();
    },
    values: async () => [...map.values()],
  };
}

export interface CachedCardRecord {
  readonly card: StoredCard;
  readonly storedAt: number;
}

/** The card cache with the TTL of `MemoryCardCache`: an entry expires `ttlMs` after `put`. */
export class KvCardCache implements CardCache {
  constructor(
    private readonly kv: Kv<CachedCardRecord>,
    private readonly now: () => number,
    private readonly ttlMs: number = DEFAULT_CACHE_TTL_MS,
  ) {}

  async get(key: string): Promise<StoredCard | undefined> {
    const entry = await this.kv.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.storedAt >= this.ttlMs) {
      await this.kv.delete(key);
      return undefined;
    }
    return entry.card;
  }

  async put(key: string, card: StoredCard): Promise<void> {
    await this.kv.put(key, { card, storedAt: this.now() });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async clear(): Promise<void> {
    await this.kv.clear();
  }
}

/** Support reports by oracle id; each carries the parser version it was computed with. */
export class KvSupportCache implements SupportCache {
  constructor(private readonly kv: Kv<SupportReport>) {}

  get(oracleId: string): Promise<SupportReport | undefined> {
    return this.kv.get(oracleId);
  }

  put(oracleId: string, report: SupportReport): Promise<void> {
    return this.kv.put(oracleId, report);
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The key of a precon's override in the `decks` store: it cannot collide with a saved deck's `deck-...` id. */
const overrideKey = (preconId: string): string => `precon:${preconId}`;

/**
 * Saved decks, newest first. Saving under a name that is already saved replaces that deck and
 * keeps its id, so editing and saving again does not pile up copies.
 */
export class KvDeckStore implements DeckStoreApi {
  constructor(
    private readonly kv: Kv<SavedDeck>,
    private readonly now: () => number,
  ) {}

  /** The saved decks, newest first; the records of edited precons are kept apart (D-215). */
  async list(): Promise<readonly SavedDeck[]> {
    return (await this.records()).filter((deck) => deck.preconId === undefined);
  }

  async overrides(): Promise<readonly SavedDeck[]> {
    return (await this.records()).filter((deck) => deck.preconId !== undefined);
  }

  async saveOverride(preconId: string, name: string, text: string): Promise<SavedDeck> {
    const saved: SavedDeck = {
      id: overrideKey(preconId),
      name: name.trim(),
      text,
      savedAt: new Date(this.now()).toISOString(),
      preconId,
    };
    await this.kv.put(saved.id, saved);
    return saved;
  }

  async removeOverride(preconId: string): Promise<void> {
    await this.kv.delete(overrideKey(preconId));
  }

  private async records(): Promise<SavedDeck[]> {
    const decks = await this.kv.values();
    return decks.sort((a, b) => compareText(b.savedAt, a.savedAt) || compareText(a.id, b.id));
  }

  async save(deck: { readonly name: string; readonly text: string }): Promise<SavedDeck> {
    const existing = await this.list();
    const name = deck.name.trim();
    const same = existing.find((known) => known.name === name);
    const time = this.now();
    let id = same?.id ?? `deck-${time.toString(36)}`;
    if (!same) {
      for (let suffix = 2; existing.some((known) => known.id === id); suffix += 1) {
        id = `deck-${time.toString(36)}-${suffix}`;
      }
    }
    const saved: SavedDeck = {
      id,
      name,
      text: deck.text,
      savedAt: new Date(time).toISOString(),
    };
    await this.kv.put(id, saved);
    return saved;
  }

  async remove(id: string): Promise<void> {
    await this.kv.delete(id);
  }
}

export class MemoryDeckStore extends KvDeckStore {
  constructor(now: () => number) {
    super(createMemoryKv<SavedDeck>(), now);
  }
}

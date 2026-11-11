// The stores of the import feature over memory (the logic IndexedDB shares), the fail-soft
// fallback when IndexedDB is unavailable, and the environment wiring. The IndexedDB code itself
// runs in a real browser in e2e/import-idb.e2e.ts.
import type { StoredCard } from '@commander-arena/cards';
import { expect, test } from 'vitest';
import {
  AppDatabase,
  createImportEnvironment,
  IdbCardCache,
  IdbDeckStore,
  IdbSupportCache,
  MemoryDeckStore,
} from '../src/import';
import { type CachedCardRecord, createMemoryKv, KvCardCache } from '../src/import/stores';
import { createFakeScryfall, createVirtualClock } from './import-fake-scryfall';
import { hundredCardText } from './import-helpers';

const CARD = { oracleId: 'synthetic-oracle-a', name: 'Synthetic A' } as unknown as StoredCard;

test('the card cache expires entries by the injected clock, like MemoryCardCache', async () => {
  const clock = createVirtualClock(1000);
  const cache = new KvCardCache(createMemoryKv<CachedCardRecord>(), clock.now, 5000);
  await cache.put('a', CARD);
  expect(await cache.get('a')).toBe(CARD);
  clock.advance(4999);
  expect(await cache.get('a')).toBe(CARD);
  clock.advance(1);
  expect(await cache.get('a')).toBeUndefined();
  await cache.put('b', CARD);
  await cache.delete('b');
  expect(await cache.get('b')).toBeUndefined();
  await cache.put('c', CARD);
  await cache.clear();
  expect(await cache.get('c')).toBeUndefined();
});

test('the deck store lists newest first and replaces a deck saved under the same name', async () => {
  const clock = createVirtualClock();
  const store = new MemoryDeckStore(clock.now);
  const first = await store.save({ name: 'Alpha', text: '1 A' });
  clock.advance(1000);
  const second = await store.save({ name: 'Beta', text: '1 B' });
  expect((await store.list()).map((d) => d.name)).toEqual(['Beta', 'Alpha']);
  clock.advance(1000);
  const again = await store.save({ name: ' Alpha ', text: '2 A' });
  expect(again.id).toBe(first.id);
  const decks = await store.list();
  expect(decks.map((d) => [d.name, d.text])).toEqual([
    ['Alpha', '2 A'],
    ['Beta', '1 B'],
  ]);
  await store.remove(second.id);
  expect((await store.list()).map((d) => d.name)).toEqual(['Alpha']);
});

test('decks saved in the same millisecond get different ids', async () => {
  const store = new MemoryDeckStore(() => 5);
  const a = await store.save({ name: 'A', text: '' });
  const b = await store.save({ name: 'B', text: '' });
  expect(a.id).not.toBe(b.id);
  expect(await store.list()).toHaveLength(2);
});

test('without IndexedDB every Idb store keeps working in memory and never throws', async () => {
  const clock = createVirtualClock();
  const database = new AppDatabase(null);
  const cards = new IdbCardCache(database, clock.now);
  await cards.put('k', CARD);
  expect(await cards.get('k')).toEqual(CARD);

  const support = new IdbSupportCache(database);
  const report = {
    status: 'supported',
    parserVersion: 1,
    source: 'parser',
    unparsed: [],
    reasons: [],
  } as const;
  await support.put('o', report);
  expect(await support.get('o')).toEqual(report);

  const decks = new IdbDeckStore(database, clock.now);
  await decks.save({ name: 'D', text: 't' });
  expect((await decks.list()).map((d) => d.name)).toEqual(['D']);
});

test('a factory whose open throws, errors or is blocked also falls back to memory', async () => {
  const throwing = {
    open: () => {
      throw new Error('SecurityError');
    },
  } as unknown as IDBFactory;
  const failing = {
    open: () => {
      const req: { onerror?: () => void } = {};
      queueMicrotask(() => req.onerror?.());
      return req;
    },
  } as unknown as IDBFactory;
  const blocked = {
    open: () => {
      const req: { onblocked?: () => void } = {};
      queueMicrotask(() => req.onblocked?.());
      return req;
    },
  } as unknown as IDBFactory;
  for (const factory of [throwing, failing, blocked]) {
    const store = new IdbDeckStore(new AppDatabase(factory), () => 1);
    await store.save({ name: 'X', text: '' });
    expect((await store.list()).map((d) => d.name)).toEqual(['X']);
  }
});

// ---------------------------------------------------------------- the environment

test('the environment wires service and stores (IndexedDB off)', async () => {
  const clock = createVirtualClock();
  const fake = createFakeScryfall();
  const env = createImportEnvironment({
    fetch: fake.fetch,
    now: clock.now,
    sleep: clock.sleep,
    idb: null,
  });
  const report = await env.service.run({ text: hundredCardText(), deckName: 'Env Deck' });
  expect(report.playable).toBe(false); // seven unsupported cards (D-056)

  // A second import of the same list reads the cards from the cache: no new Scryfall request.
  const calls = fake.calls.length;
  await env.service.run({ text: hundredCardText(), deckName: 'Env Deck' });
  expect(fake.calls.length).toBe(calls);

  await env.decks.save({ name: 'Env Deck', text: hundredCardText() });
  expect((await env.decks.list()).map((d) => d.name)).toEqual(['Env Deck']);
});

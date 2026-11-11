import { expect, type Page, test } from '@playwright/test';
import { build } from 'vite';

/**
 * The IndexedDB stores of the import feature, in a real browser (M4). The stores are bundled by
 * Vite from `e2e/harness/idb-entry.ts` and injected into a page of the app's origin as
 * `window.ImportIdb`; no screen is needed. Everything it fetches is the SYNTHETIC fake Scryfall.
 * The checks that matter: data survives a new connection and a page reload (so it really is in
 * IndexedDB, not in the in-memory copy a store keeps), the TTL of cached cards, and the fail-soft
 * fallback when IndexedDB cannot be opened.
 */
type Lib = typeof import('./harness/idb-entry');

let bundle = '';

test.beforeAll(async () => {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: new URL('./harness/idb-entry.ts', import.meta.url).pathname,
        name: 'ImportIdb',
        formats: ['iife'],
      },
    },
  });
  const results = Array.isArray(output) ? output : [output];
  for (const result of results) {
    if (!('output' in result)) continue;
    for (const chunk of result.output) {
      if (chunk.type === 'chunk' && chunk.isEntry) bundle = chunk.code;
    }
  }
  if (bundle === '') throw new Error('the IndexedDB test bundle was not built');
});

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
}

test('decks, cards and support reports survive a new connection and a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);

  await page.evaluate(async () => {
    const lib = (window as unknown as { ImportIdb: Lib }).ImportIdb;
    const db = new lib.AppDatabase(indexedDB);
    const decks = new lib.IdbDeckStore(db, () => 1_800_000_000_000);
    await decks.save({ name: 'Persisted', text: '1 Synthetic Commander' });
    const support = new lib.IdbSupportCache(db);
    await support.put('synthetic-oracle-a', {
      status: 'unsupported',
      parserVersion: 1,
      source: 'parser',
      unparsed: [],
      reasons: ['synthetic'],
    });
    const cards = new lib.IdbCardCache(db, () => 1000, 5000);
    await cards.put('synthetic card', {
      oracleId: 'synthetic-oracle-a',
      name: 'Synthetic A',
    } as never);
  });

  await page.reload();
  await page.addScriptTag({ content: bundle });

  const read = await page.evaluate(async () => {
    const lib = (window as unknown as { ImportIdb: Lib }).ImportIdb;
    // A fresh connection with fresh store objects: nothing is left in any in-memory copy.
    const db = new lib.AppDatabase(indexedDB);
    const decks = await new lib.IdbDeckStore(db, () => 0).list();
    const support = await new lib.IdbSupportCache(db).get('synthetic-oracle-a');
    const fresh = await new lib.IdbCardCache(db, () => 5999, 5000).get('synthetic card');
    const stale = await new lib.IdbCardCache(db, () => 6000, 5000).get('synthetic card');
    const gone = await new lib.IdbCardCache(db, () => 0, 5000).get('synthetic card');
    return { decks, support, fresh, stale, gone };
  });
  expect(read.decks.map((d: { name: string }) => d.name)).toEqual(['Persisted']);
  expect(read.support).toMatchObject({ status: 'unsupported', reasons: ['synthetic'] });
  expect(read.fresh).toMatchObject({ name: 'Synthetic A' });
  // The entry expired at storedAt + ttl (1000 + 5000) and was deleted by the first expired read.
  expect(read.stale).toBeUndefined();
  expect(read.gone).toBeUndefined();
  expect(errors).toEqual([]);
});

test('upgrading a version 1 database keeps its data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);

  // The app itself opened the current version when the page loaded; start from nothing, then make
  // a database exactly as the first release did: version 1, four stores, a saved deck, a support
  // report and a request in it (the `requests` store is no longer used; an old one is left alone).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const deleting = indexedDB.deleteDatabase('commander-arena');
        deleting.onerror = () => reject(deleting.error);
        deleting.onsuccess = () => resolve();
      }),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('commander-arena', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of ['cards', 'support', 'decks', 'requests']) db.createObjectStore(name);
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['decks', 'support', 'requests'], 'readwrite');
          tx.objectStore('decks').put(
            {
              id: 'deck-v1',
              name: 'From version 1',
              text: '1 Synthetic Commander',
              savedAt: '2027-01-01T00:00:00.000Z',
            },
            'deck-v1',
          );
          tx.objectStore('support').put(
            { status: 'supported', parserVersion: 1, source: 'parser', unparsed: [], reasons: [] },
            'synthetic-oracle-a',
          );
          tx.objectStore('requests').put(
            { id: 'request-v1', cardName: 'Old request' },
            'request-v1',
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );

  const upgraded = await page.evaluate(async () => {
    const lib = (window as unknown as { ImportIdb: Lib }).ImportIdb;
    const db = new lib.AppDatabase(indexedDB);
    const decks = await new lib.IdbDeckStore(db, () => 0).list();
    const support = await new lib.IdbSupportCache(db).get('synthetic-oracle-a');
    const opened = await db.open();
    return {
      decks: decks.map((d: { name: string }) => d.name),
      support: support?.status,
      stores: [...(opened?.objectStoreNames ?? [])].sort(),
      version: opened?.version,
    };
  });
  expect(upgraded).toEqual({
    decks: ['From version 1'],
    support: 'supported',
    stores: ['cards', 'decks', 'requests', 'support'],
    version: 2,
  });

  // And it is really in IndexedDB: a fresh connection after a reload sees the deck.
  await page.reload();
  await page.addScriptTag({ content: bundle });
  const afterReload = await page.evaluate(async () => {
    const lib = (window as unknown as { ImportIdb: Lib }).ImportIdb;
    const db = new lib.AppDatabase(indexedDB);
    return {
      decks: (await new lib.IdbDeckStore(db, () => 0).list()).map((d: { name: string }) => d.name),
    };
  });
  expect(afterReload).toEqual({ decks: ['From version 1'] });
  expect(errors).toEqual([]);
});

test('an import through the real environment caches cards and support across a reload', async ({
  page,
}) => {
  await open(page);
  const first = await page.evaluate(async () => {
    const lib = (window as unknown as { ImportIdb: Lib }).ImportIdb;
    const fake = lib.createFakeScryfall();
    const clock = lib.createVirtualClock(Date.now());
    const env = lib.createImportEnvironment({
      fetch: fake.fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    const report = await env.service.run({ text: lib.hundredCardText(), deckName: 'Browser Deck' });
    await env.decks.save({ name: 'Browser Deck', text: lib.hundredCardText() });
    return { playable: report.playable, calls: fake.calls.length };
  });
  // Seven unsupported cards make the deck invalid (D-056); the point here is the caching.
  expect(first).toEqual({ playable: false, calls: 1 });

  await page.reload();
  await page.addScriptTag({ content: bundle });
  const second = await page.evaluate(async () => {
    const lib = (window as unknown as { ImportIdb: Lib }).ImportIdb;
    const fake = lib.createFakeScryfall();
    const clock = lib.createVirtualClock(Date.now());
    const env = lib.createImportEnvironment({
      fetch: fake.fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    const report = await env.service.run({ text: lib.hundredCardText(), deckName: 'Browser Deck' });
    return {
      playable: report.playable,
      calls: fake.calls.length,
      decks: (await env.decks.list()).map((d: { name: string }) => d.name),
    };
  });
  // Cards come from the IndexedDB cache: the fake Scryfall is never asked.
  expect(second).toEqual({ playable: false, calls: 0, decks: ['Browser Deck'] });
});

test('when the database cannot be opened the stores fall back to memory and never throw', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const lib = (window as unknown as { ImportIdb: Lib }).ImportIdb;
    // A newer database of the same name makes opening version 1 fail with a VersionError.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('commander-arena', 7);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const db = new lib.AppDatabase(indexedDB);
    const decks = new lib.IdbDeckStore(db, () => 1);
    await decks.save({ name: 'Soft', text: 't' });
    return (await decks.list()).map((d: { name: string }) => d.name);
  });
  expect(result).toEqual(['Soft']);
});

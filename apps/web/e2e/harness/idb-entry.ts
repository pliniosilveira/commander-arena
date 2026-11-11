// Entry of the IndexedDB test bundle (e2e/import-idb.e2e.ts): the import feature plus the
// SYNTHETIC fake Scryfall, built by Vite into one script and injected into a page of the app's
// origin, so the stores run against the browser's real IndexedDB.
export * from '../../src/import';
export { createFakeScryfall, createVirtualClock } from '../../test/import-fake-scryfall';
export { hundredCardText } from '../../test/import-helpers';

/** The import feature (M4): service, deck helpers, IndexedDB stores, environment. */

export { markCommanders } from './commander-text';
export { computeCoverage } from './coverage';
export {
  checkPlayable,
  type DeckCheck,
  deckLabel,
  toDeckConfig,
  unplayableReason,
  unsupportedCount,
} from './deck';
export {
  type BrowserImportEnvironment,
  createImportEnvironment,
  type ImportEnvironmentOptions,
} from './environment';
export {
  AppDatabase,
  IdbCardCache,
  IdbDeckStore,
  IdbSupportCache,
} from './idb';
export { createImportService, type ImportServiceOptions } from './service';
export { MemoryDeckStore } from './stores';
export type * from './types';

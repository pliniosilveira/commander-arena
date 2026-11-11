/** The Scryfall client: schema, request queue, cache and name resolution (SPEC 6.2). */

export { type CardCache, DEFAULT_CACHE_TTL_MS, MemoryCardCache } from './cache';
export {
  createScryfallClient,
  type ScryfallClient,
  type ScryfallClientOptions,
} from './client';
export { normalizeNameKey } from './names';
export {
  createRequestQueue,
  type QueueFailure,
  type QueueOutcome,
  type QueueRequest,
  type QueueResponse,
  type RequestQueue,
  type RequestQueueOptions,
  type ScryfallFetch,
} from './queue';
export {
  COLLECTION_BATCH_SIZE,
  type FuzzyMatch,
  type ResolveFailure,
  type ResolveResult,
} from './resolve';
export {
  type CardConversion,
  parseStoredCard,
  type ScryfallCard,
  scryfallCardSchema,
  scryfallCollectionSchema,
  toStoredCard,
} from './schema';

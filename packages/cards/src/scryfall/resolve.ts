/**
 * Resolving decklist names to Scryfall cards (SPEC 6.2, D-048): cache first, then
 * `POST /cards/collection` in batches of at most 75 identifiers, then `/cards/named?exact=` and
 * `?fuzzy=` for what the batches did not return. Results are matched to requests by name, never
 * by position. A fuzzy hit is only a candidate for the user to confirm.
 */
import type { StoredCard } from '../types';
import type { CardCache } from './cache';
import { frontFaceName, normalizeNameKey } from './names';
import type { RequestQueue } from './queue';
import { parseStoredCard, scryfallCollectionSchema, scryfallErrorSchema } from './schema';

const API = 'https://api.scryfall.com';
/** Scryfall accepts at most 75 identifiers per `/cards/collection` request (D-048). */
export const COLLECTION_BATCH_SIZE = 75;

export interface FuzzyMatch {
  readonly requested: string;
  /** The closest card. Not accepted: the user has to confirm it. */
  readonly candidate: StoredCard;
}

export interface ResolveFailure {
  readonly requested: string;
  readonly message: string;
}

export interface ResolveResult {
  /** Cards by normalized requested name. */
  readonly found: ReadonlyMap<string, StoredCard>;
  /** Requested names no card matched, as the caller wrote them. */
  readonly notFound: string[];
  readonly fuzzy: FuzzyMatch[];
  /** Names that could not be looked up at all (network trouble, HTTP errors). */
  readonly failures: ResolveFailure[];
}

export interface ResolveDeps {
  readonly queue: RequestQueue;
  readonly cache: CardCache | undefined;
  readonly now: () => number;
}

interface Pending {
  readonly key: string;
  readonly requested: string;
  /** The name sent to Scryfall: the front face only. */
  readonly front: string;
}

type Outcome =
  | { readonly kind: 'found'; readonly card: StoredCard }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'fuzzy'; readonly card: StoredCard }
  | { readonly kind: 'failure'; readonly message: string };

/** Every key a card is stored under: its oracle id, its full name and each face name. */
export function cacheKeys(card: StoredCard): string[] {
  const keys = new Set<string>([card.oracleId, normalizeNameKey(card.name)]);
  for (const face of card.faces) keys.add(normalizeNameKey(face.name));
  return [...keys];
}

async function cacheGet(
  cache: CardCache | undefined,
  key: string,
): Promise<StoredCard | undefined> {
  if (!cache) return undefined;
  try {
    return await cache.get(key);
  } catch {
    return undefined; // A broken cache must never lose a lookup.
  }
}

async function cachePut(
  cache: CardCache | undefined,
  card: StoredCard,
  extraKey: string | null,
): Promise<void> {
  if (!cache) return;
  const keys = cacheKeys(card);
  if (extraKey !== null && !keys.includes(extraKey)) keys.push(extraKey);
  try {
    for (const key of keys) await cache.put(key, card);
  } catch {
    // Ignored: the card is still returned to the caller.
  }
}

function errorMessage(status: number, json: unknown): string {
  const error = scryfallErrorSchema.safeParse(json);
  const details = error.success ? error.data.details : undefined;
  return details ? `HTTP ${status}: ${details}` : `HTTP ${status}`;
}

/** Indexes returned cards by full name and by face name, to match them back to requests. */
function indexByName(cards: readonly StoredCard[]): (key: string) => StoredCard | undefined {
  const full = new Map<string, StoredCard>();
  const faces = new Map<string, StoredCard>();
  for (const card of cards) {
    const fullKey = normalizeNameKey(card.name);
    if (!full.has(fullKey)) full.set(fullKey, card);
    for (const face of card.faces) {
      const faceKey = normalizeNameKey(face.name);
      if (!faces.has(faceKey)) faces.set(faceKey, card);
    }
  }
  return (key) => full.get(key) ?? faces.get(key);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function collectionBatch(
  deps: ResolveDeps,
  members: readonly Pending[],
  fronts: readonly string[],
  outcomes: Map<string, Outcome>,
): Promise<Pending[]> {
  const fail = (message: string): Pending[] => {
    for (const member of members) outcomes.set(member.key, { kind: 'failure', message });
    return [];
  };
  const result = await deps.queue.request({
    url: `${API}/cards/collection`,
    method: 'POST',
    json: { identifiers: fronts.map((name) => ({ name })) },
  });
  if (result.kind === 'failure') return fail(result.message);
  if (!result.ok) return fail(errorMessage(result.status, result.json));
  const body = scryfallCollectionSchema.safeParse(result.json);
  if (!body.success) return fail('unexpected response from /cards/collection');

  const cards: StoredCard[] = [];
  for (const item of body.data.data) {
    const converted = parseStoredCard(item, deps.now());
    if (converted.card) cards.push(converted.card);
  }
  const lookup = indexByName(cards);
  const unmatched: Pending[] = [];
  for (const member of members) {
    const card = lookup(member.key);
    if (card) {
      outcomes.set(member.key, { kind: 'found', card });
      await cachePut(deps.cache, card, member.key);
    } else {
      // Reported in not_found, or missing from the answer without a word: either way retried.
      unmatched.push(member);
    }
  }
  return unmatched;
}

async function namedLookup(
  deps: ResolveDeps,
  mode: 'exact' | 'fuzzy',
  name: string,
): Promise<
  | { readonly kind: 'card'; readonly card: StoredCard }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'failure'; readonly message: string }
> {
  const url = new URL(`${API}/cards/named`);
  url.searchParams.set(mode, name);
  const result = await deps.queue.request({ url: url.href });
  if (result.kind === 'failure') return { kind: 'failure', message: result.message };
  if (result.status === 404) return { kind: 'not-found' };
  if (!result.ok) return { kind: 'failure', message: errorMessage(result.status, result.json) };
  const converted = parseStoredCard(result.json, deps.now());
  if (!converted.card) {
    return { kind: 'failure', message: `unreadable card from /cards/named: ${converted.reason}` };
  }
  return { kind: 'card', card: converted.card };
}

async function fallback(deps: ResolveDeps, pending: Pending): Promise<Outcome> {
  const exact = await namedLookup(deps, 'exact', pending.front);
  if (exact.kind === 'failure') return exact;
  if (exact.kind === 'card') {
    await cachePut(deps.cache, exact.card, pending.key);
    return { kind: 'found', card: exact.card };
  }
  const fuzzy = await namedLookup(deps, 'fuzzy', pending.front);
  if (fuzzy.kind === 'failure') return fuzzy;
  if (fuzzy.kind === 'not-found') return { kind: 'not-found' };
  // Cached under its own names only, never under the requested one: the user has not confirmed it.
  await cachePut(deps.cache, fuzzy.card, null);
  return { kind: 'fuzzy', card: fuzzy.card };
}

export async function resolveNames(
  deps: ResolveDeps,
  names: readonly string[],
): Promise<ResolveResult> {
  const requests: Pending[] = [];
  const seen = new Set<string>();
  for (const requested of names) {
    const key = normalizeNameKey(requested);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    requests.push({ key, requested, front: frontFaceName(requested) });
  }

  const outcomes = new Map<string, Outcome>();
  const missing: Pending[] = [];
  for (const request of requests) {
    const card = await cacheGet(deps.cache, request.key);
    if (card) outcomes.set(request.key, { kind: 'found', card });
    else missing.push(request);
  }

  // One identifier per front-face name, even when two requested names share it.
  const fronts = new Map<string, string>();
  for (const request of missing) {
    const frontKey = normalizeNameKey(request.front);
    if (!fronts.has(frontKey)) fronts.set(frontKey, request.front);
  }
  const unmatched: Pending[] = [];
  for (const batch of chunk([...fronts.entries()], COLLECTION_BATCH_SIZE)) {
    const batchKeys = new Set(batch.map(([frontKey]) => frontKey));
    const members = missing.filter((request) => batchKeys.has(normalizeNameKey(request.front)));
    unmatched.push(
      ...(await collectionBatch(
        deps,
        members,
        batch.map(([, front]) => front),
        outcomes,
      )),
    );
  }
  for (const request of unmatched) outcomes.set(request.key, await fallback(deps, request));

  const result = {
    found: new Map<string, StoredCard>(),
    notFound: [] as string[],
    fuzzy: [] as FuzzyMatch[],
    failures: [] as ResolveFailure[],
  };
  for (const request of requests) {
    const outcome = outcomes.get(request.key);
    if (outcome?.kind === 'found') result.found.set(request.key, outcome.card);
    else if (outcome?.kind === 'fuzzy') {
      result.fuzzy.push({ requested: request.requested, candidate: outcome.card });
    } else if (outcome?.kind === 'failure') {
      result.failures.push({ requested: request.requested, message: outcome.message });
    } else result.notFound.push(request.requested);
  }
  return result;
}

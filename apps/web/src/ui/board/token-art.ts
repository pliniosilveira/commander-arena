import { createRequestQueue, type RequestQueue, tokenSearchQuery } from '@commander-arena/cards';
import type { TokenDefinition } from '@commander-arena/engine';
import { useEffect, useState } from 'react';
import { type ArtVersion, type CardArt, parseCardArt } from './image-uris';

/** An ambiguous or malformed answer is not an image match. */
export function parseTokenSearch(answer: unknown): CardArt | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const list = answer as { total_cards?: unknown; has_more?: unknown; data?: unknown };
  if (
    list.total_cards !== 1 ||
    list.has_more !== false ||
    !Array.isArray(list.data) ||
    list.data.length !== 1
  ) {
    return null;
  }
  return parseCardArt(list.data[0]);
}

/** Caches successes, misses and in-flight requests across instances and image versions. */
export function createTokenArtLookup(queue: RequestQueue) {
  const cache = new Map<string, Promise<CardArt | null>>();
  return (query: string): Promise<CardArt | null> => {
    let result = cache.get(query);
    if (result === undefined) {
      result = queue
        .request({ url: `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}` })
        .then((r) => (r.kind === 'response' && r.ok ? parseTokenSearch(r.json) : null))
        .catch(() => null);
      cache.set(query, result);
    }
    return result;
  };
}

const lookup = createTokenArtLookup(
  createRequestQueue({
    fetch: (url, init) => fetch(url, init),
    now: () => performance.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maxErrorRetries: 0,
  }),
);

export function useTokenArt(
  definition: TokenDefinition | undefined,
  version: ArtVersion,
): string | null {
  const query = definition === undefined ? null : tokenSearchQuery(definition);
  const [found, setFound] = useState<{ query: string; art: CardArt | null } | null>(null);
  useEffect(() => {
    if (query === null) return;
    let alive = true;
    void lookup(query).then((art) => {
      if (alive) setFound({ query, art });
    });
    return () => {
      alive = false;
    };
  }, [query]);
  return found?.query === query ? (found?.art?.[version] ?? null) : null;
}

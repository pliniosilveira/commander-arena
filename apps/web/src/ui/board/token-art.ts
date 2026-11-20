import { createRequestQueue, type RequestQueue, tokenSearchQuery } from '@commander-arena/cards';
import type { TokenDefinition } from '@commander-arena/engine';
import { useEffect, useState } from 'react';
import { type ArtVersion, type CardArt, parseCardArt } from './image-uris';

/** What makes two token cards the same token, whatever their art: Scryfall keeps one card per printing family. */
function sameToken(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const [x, y] = [a as Record<string, unknown>, b as Record<string, unknown>];
  return (
    ['name', 'type_line', 'oracle_text', 'power', 'toughness'].every(
      (field) => typeof x[field] === typeof y[field] && x[field] === y[field],
    ) && JSON.stringify(x.colors) === JSON.stringify(y.colors)
  );
}

/**
 * The image of the token an answer names. An ambiguous or malformed answer is not an image match:
 * the whole answer must be there (`has_more` false) and name one token. Several cards name one
 * token when they agree on name, type line, rules text, power, toughness and colors (the Pest of
 * two Strixhaven sets); the first, which the query asked to be the best printing, gives the image.
 */
export function parseTokenSearch(answer: unknown): CardArt | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const list = answer as { total_cards?: unknown; has_more?: unknown; data?: unknown };
  if (
    list.has_more !== false ||
    !Array.isArray(list.data) ||
    list.data.length === 0 ||
    list.total_cards !== list.data.length
  ) {
    return null;
  }
  const [first, ...rest] = list.data;
  if (!rest.every((card) => sameToken(first, card))) return null;
  return parseCardArt(first);
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

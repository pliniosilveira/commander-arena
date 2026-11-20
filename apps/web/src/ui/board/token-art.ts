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
 * Rules text as two wordings of one ability compare equal: Scryfall writes "this creature" where a
 * card that makes the token says "this token", and the two differ in case and punctuation.
 */
function plainText(text: unknown): string {
  return typeof text !== 'string'
    ? ''
    : text
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/\bthis (token|creature|artifact|permanent)\b/g, 'this')
        .replace(/[^a-z0-9+/{}]+/g, ' ')
        .trim();
}

/**
 * The image of the token an answer names. An ambiguous or malformed answer is not an image match:
 * the whole answer must be there (`has_more` false) and name one token. Several cards name one
 * token when they agree on name, type line, rules text, power, toughness and colors (the Pest of
 * two printings Scryfall keeps apart); the first, which the query asked to be the best printing,
 * gives the image. When the cards are different tokens (the two Pests of Strixhaven: one gains life
 * when it attacks, the other when it dies), `oracleText`, the rules text of the token asked for,
 * picks the ones that say the same; with none or without it the answer stays ambiguous.
 */
export function parseTokenSearch(answer: unknown, oracleText?: string): CardArt | null {
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
  const all: readonly unknown[] = list.data;
  const wanted = oracleText === undefined ? null : plainText(oracleText);
  const named =
    all.length === 1 || wanted === null
      ? all
      : all.filter(
          (card) =>
            typeof card === 'object' &&
            card !== null &&
            plainText((card as { oracle_text?: unknown }).oracle_text) === wanted,
        );
  const [first, ...rest] = named;
  if (first === undefined || !rest.every((card) => sameToken(first, card))) return null;
  return parseCardArt(first);
}

/** Caches successes, misses and in-flight requests across instances and image versions. */
export function createTokenArtLookup(queue: RequestQueue) {
  const cache = new Map<string, Promise<CardArt | null>>();
  return (query: string, oracleText?: string): Promise<CardArt | null> => {
    const key = `${query}\n${oracleText ?? ''}`;
    let result = cache.get(key);
    if (result === undefined) {
      result = queue
        .request({ url: `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}` })
        .then((r) => (r.kind === 'response' && r.ok ? parseTokenSearch(r.json, oracleText) : null))
        .catch(() => null);
      cache.set(key, result);
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
  const text = definition?.oracleText;
  const [found, setFound] = useState<{ query: string; art: CardArt | null } | null>(null);
  useEffect(() => {
    if (query === null) return;
    let alive = true;
    void lookup(query, text).then((art) => {
      if (alive) setFound({ query, art });
    });
    return () => {
      alive = false;
    };
  }, [query, text]);
  return found?.query === query ? (found?.art?.[version] ?? null) : null;
}

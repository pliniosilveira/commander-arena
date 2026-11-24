import {
  createRequestQueue,
  type RequestQueue,
  tokenKeywordWords,
  tokenSearchQuery,
} from '@commander-arena/cards';
import type { TokenDefinition } from '@commander-arena/engine';
import { useEffect, useState } from 'react';
import { type ArtVersion, type CardArt, parseCardArt } from './image-uris';
import { createLookupCache, outcomeOf } from './lookup-cache';
import { chosenTokenArt, tokenChoiceKey } from './token-choices';

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
export function plainText(text: unknown): string {
  return typeof text !== 'string'
    ? ''
    : text
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/\bthis (token|creature|artifact|permanent)\b/g, 'this')
        .replace(/[^a-z0-9+/{}]+/g, ' ')
        .trim();
}

/** The comma-separated parts of a rules text, in any order: "Flying, vigilance" and "Vigilance, flying" say the same. */
function partsOf(text: unknown): string {
  return typeof text !== 'string'
    ? ''
    : text
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .split(/[,\n]/)
        .map((part) => part.trim())
        .filter((part) => part !== '')
        .sort()
        .join('|');
}

/**
 * What to compare a Scryfall token card's rules text with: the token's own text, or, for a token whose text is only its keywords (the
 * Angel with flying: the definition keeps them as abilities and no text), those keywords as Scryfall prints them. Undefined for a
 * token with neither, which the search already narrowed to the textless cards.
 */
export function tokenWantedText(token: TokenDefinition): string | undefined {
  if (token.oracleText.trim() !== '') return token.oracleText;
  const words = tokenKeywordWords(token);
  const text = words.join(', ');
  return text === '' ? undefined : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
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
            (plainText((card as { oracle_text?: unknown }).oracle_text) === wanted ||
              partsOf((card as { oracle_text?: unknown }).oracle_text) === partsOf(oracleText)),
        );
  const [first, ...rest] = named;
  if (first === undefined || !rest.every((card) => sameToken(first, card))) return null;
  return parseCardArt(first);
}

/** Caches successes, definitive misses and in-flight requests across instances and image versions; a failed request is asked again later. */
export function createTokenArtLookup(queue: RequestQueue, now?: () => number) {
  const cache = createLookupCache<CardArt>(now);
  return (query: string, oracleText?: string): Promise<CardArt | null> =>
    cache(`${query}\n${oracleText ?? ''}`, async () =>
      outcomeOf(
        await queue.request({
          url: `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`,
        }),
        (json) => parseTokenSearch(json, oracleText),
      ),
    );
}

/** The search for an emblem card by its name; null for the generic "Emblem" an effect makes, which no card is named after. */
export function emblemSearchQuery(name: string): string | null {
  return name === '' || name === 'Emblem' ? null : `!${JSON.stringify(name)} t:emblem game:paper`;
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
  const text = definition === undefined ? undefined : tokenWantedText(definition);
  const [found, setFound] = useState<{ query: string; art: CardArt | null } | null>(null);
  // The art the player chose for this token on the deck screen wins over the best printing.
  const chosen = definition === undefined ? null : chosenTokenArt(tokenChoiceKey(definition));
  useEffect(() => {
    if (query === null || chosen !== null) return;
    let alive = true;
    void lookup(query, text).then((art) => {
      if (alive) setFound({ query, art });
    });
    return () => {
      alive = false;
    };
  }, [query, text, chosen]);
  if (chosen !== null) return chosen[version] ?? chosen.normal ?? null;
  return found?.query === query ? (found?.art?.[version] ?? null) : null;
}

/** The picture of the emblem card named `name` (the Ring): null while it is asked for, when Scryfall has no such card, or for `name` null. */
export function useEmblemArt(name: string | null, version: ArtVersion): string | null {
  const query = name === null ? null : emblemSearchQuery(name);
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

/**
 * Issue 366: the picture of a commander. Scryfall's name lookup gives the default printing; a commander is the face of the deck, so
 * a nicer one is asked for first: a printing with a special frame (borderless, extended art, showcase or full art). When
 * Scryfall has none, or cannot be reached, the card is drawn as before, by name.
 */
import { createRequestQueue, type RequestQueue } from '@commander-arena/cards';
import { useEffect, useState } from 'react';
import { type ArtVersion, type CardArt, parseCardArt } from './image-uris';

/** The search for the special printings of one commander (a double-faced card is asked by its front face). Foil or not: the picture is the same scan. */
export function commanderArtQuery(name: string): string {
  const front = (name.split(' // ')[0] ?? name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `!"${front}" game:paper (is:borderless or is:extendedart or is:showcase or is:fullart)`;
}

/**
 * The pictures of the first printing of the answer that has some, or null. A printing that shows another name than the card's own
 * (a Universes Beyond reprint, `printed_name`) is skipped: the board would show a different card.
 */
export function parseCommanderSearch(answer: unknown): CardArt | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const data = (answer as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  for (const card of data) {
    const { name, printed_name: printed } = (card ?? {}) as {
      name?: unknown;
      printed_name?: unknown;
    };
    if (typeof printed === 'string' && printed !== name) continue;
    const art = parseCardArt(card);
    if (art !== null) return art;
  }
  return null;
}

/** Caches successes, misses and requests in flight, so each commander is asked about once. */
export function createCommanderArtLookup(queue: Pick<RequestQueue, 'request'>) {
  const cache = new Map<string, Promise<CardArt | null>>();
  return (query: string): Promise<CardArt | null> => {
    let result = cache.get(query);
    if (result === undefined) {
      const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`;
      result = queue
        .request({ url })
        .then((r) => (r.kind === 'response' && r.ok ? parseCommanderSearch(r.json) : null))
        .catch(() => null);
      cache.set(query, result);
    }
    return result;
  };
}

const lookup = createCommanderArtLookup(
  createRequestQueue({
    fetch: (url, init) => fetch(url, init),
    now: () => performance.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maxErrorRetries: 0,
  }),
);

/** The URL of the special picture of the commander `name`, or null while it is asked for, when there is none, or when `name` is null. */
export function useCommanderArt(name: string | null, version: ArtVersion): string | null {
  const query = name === null || name === '' ? null : commanderArtQuery(name);
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

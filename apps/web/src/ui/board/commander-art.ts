/**
 * Issue 366: the picture of a commander. Scryfall's name lookup gives the default printing; a commander is the face of the deck, so
 * a nicer one is asked for first: a printing with a special frame (borderless, extended art, showcase or full art), in the set the
 * deck's list names, else in any set. Then the printing the list names (first of all when the player chose it); when there is none, or Scryfall cannot be reached, the card
 * is drawn as before, by name.
 */
import { createRequestQueue, type RequestQueue } from '@commander-arena/cards';
import { useEffect, useState } from 'react';
import { printingOf } from './deck-printings';
import { type ArtVersion, type CardArt, parseCardArt } from './image-uris';

/**
 * The search for the special printings of one commander (a double-faced card is asked by its front face), in one set when `set` is
 * given (a code the decklist reader has already checked: letters and digits). Foil or not: the picture is the same scan.
 */
export function commanderArtQuery(name: string, set?: string): string {
  const front = (name.split(' // ')[0] ?? name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const inSet = set === undefined ? '' : ` set:${set}`;
  return `!"${front}" game:paper${inSet} (is:borderless or is:extendedart or is:showcase or is:fullart)`;
}

export interface ArtLookups {
  readonly search: (query: string) => Promise<CardArt | null>;
  readonly printing: (set: string, collector: string, name: string) => Promise<CardArt | null>;
}

/**
 * The picture of a commander, best first: a special printing in the set the deck's list names, a special printing in any set, the
 * printing the list names, and null (the card is then drawn by name). A list that names no printing starts at the second.
 */
export async function findCommanderArt(
  name: string,
  printing: {
    readonly set: string;
    readonly collector: string;
    readonly explicit?: boolean;
  } | null,
  lookups: ArtLookups,
): Promise<CardArt | null> {
  // A printing the player chose on the deck screen is used as it is, before any special printing.
  if (printing?.explicit === true) {
    const chosen = await lookups.printing(printing.set, printing.collector, name);
    if (chosen !== null) return chosen;
  }
  if (printing !== null) {
    const inSet = await lookups.search(commanderArtQuery(name, printing.set));
    if (inSet !== null) return inSet;
  }
  const anywhere = await lookups.search(commanderArtQuery(name));
  if (anywhere !== null) return anywhere;
  return printing === null ? null : lookups.printing(printing.set, printing.collector, name);
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

type Queue = Pick<RequestQueue, 'request'>;

/** One cached GET: successes, misses and requests in flight are remembered by URL. */
function cachedGet(
  cache: Map<string, Promise<CardArt | null>>,
  queue: Queue,
  url: string,
  parse: (json: unknown) => CardArt | null,
): Promise<CardArt | null> {
  let result = cache.get(url);
  if (result === undefined) {
    result = queue
      .request({ url })
      .then((r) => (r.kind === 'response' && r.ok ? parse(r.json) : null))
      .catch(() => null);
    cache.set(url, result);
  }
  return result;
}

/** Caches successes, misses and requests in flight, so each commander is asked about once. */
export function createCommanderArtLookup(queue: Queue) {
  const cache = new Map<string, Promise<CardArt | null>>();
  return (query: string): Promise<CardArt | null> =>
    cachedGet(
      cache,
      queue,
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`,
      parseCommanderSearch,
    );
}

/**
 * The pictures of one printing, by set code and collector number, when the card it answers has the name asked for. A printing under
 * another printed name (a Universes Beyond reprint) is used: the deck's list chose it.
 */
export function createPrintingLookup(queue: Queue) {
  const cache = new Map<string, Promise<CardArt | null>>();
  return (set: string, collector: string, name: string): Promise<CardArt | null> =>
    cachedGet(
      cache,
      queue,
      `https://api.scryfall.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(collector)}`,
      (json) => {
        const card = json as { name?: unknown } | null;
        const front = (value: unknown) => (typeof value === 'string' ? value.split(' // ')[0] : '');
        // A list that names the printing of another card must not draw that card.
        if (front(card?.name)?.toLowerCase() !== (name.split(' // ')[0] ?? name).toLowerCase())
          return null;
        return parseCardArt(json);
      },
    );
}

const queue = createRequestQueue({
  fetch: (url, init) => fetch(url, init),
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxErrorRetries: 0,
});
const lookup = createCommanderArtLookup(queue);
const lookupPrinting = createPrintingLookup(queue);

/**
 * The picture of the printing the deck's list names for the card `name` (not a commander: `useCommanderArt` covers those).
 * `pending` while it is asked for, so the card is not first drawn in another printing; `url` null when the list names none, or
 * when Scryfall answers another card or a printing under another name (then the card is drawn by name).
 */
export function useListedArt(
  name: string | null,
  version: ArtVersion,
): { readonly pending: boolean; readonly url: string | null } {
  const printing = name === null || name === '' ? null : printingOf(name);
  const key =
    printing === null || name === null ? null : `${printing.set}/${printing.collector}\n${name}`;
  const [found, setFound] = useState<{ key: string; art: CardArt | null } | null>(null);
  useEffect(() => {
    if (key === null || printing === null || name === null) return;
    let alive = true;
    void lookupPrinting(printing.set, printing.collector, name).then((art) => {
      if (alive) setFound({ key, art });
    });
    return () => {
      alive = false;
    };
  }, [key, printing, name]);
  if (key === null) return { pending: false, url: null };
  if (found?.key !== key) return { pending: true, url: null };
  return { pending: false, url: found.art?.[version] ?? null };
}

/** The URL of the special picture of the commander `name`, or null while it is asked for, when there is none, or when `name` is null. */
export function useCommanderArt(name: string | null, version: ArtVersion): string | null {
  const query = name === null || name === '' ? null : commanderArtQuery(name);
  const printing = query === null || name === null ? null : printingOf(name);
  // The key of this commander's lookup: the printing the deck's list names, when it names one, and the search.
  const key = printing === null ? query : `${printing.set}/${printing.collector}\n${query}`;
  const [found, setFound] = useState<{ query: string; art: CardArt | null } | null>(null);
  useEffect(() => {
    if (query === null || key === null || name === null) return;
    let alive = true;
    void findCommanderArt(name, printing, { search: lookup, printing: lookupPrinting }).then(
      (art) => {
        if (alive) setFound({ query: key, art });
      },
    );
    return () => {
      alive = false;
    };
  }, [query, key, name, printing]);
  return found?.query === key ? (found?.art?.[version] ?? null) : null;
}

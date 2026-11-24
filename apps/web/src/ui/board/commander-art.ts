/**
 * The picture of the printing a deck names for a card (a precon's list, or the one the player chose on the deck screen), by set code
 * and collector number. A card whose list names none is drawn by name, as Scryfall's default. No other printing is ever searched for.
 */
import { createRequestQueue, type RequestQueue } from '@commander-arena/cards';
import { useEffect, useState } from 'react';
import { printingOf } from './deck-printings';
import { type ArtVersion, type CardArt, parseCardArt } from './image-uris';
import { createLookupCache, outcomeOf } from './lookup-cache';

type Queue = Pick<RequestQueue, 'request'>;

/** One cached GET: successes and misses are remembered by URL, a failure is asked again later (`lookup-cache.ts`). */
function cachedGet(
  cache: ReturnType<typeof createLookupCache<CardArt>>,
  queue: Queue,
  url: string,
  parse: (json: unknown) => CardArt | null,
): Promise<CardArt | null> {
  return cache(url, async () => outcomeOf(await queue.request({ url }), parse));
}

/**
 * The pictures of one printing, by set code and collector number, when the card it answers has the name asked for. A printing under
 * another printed name (a Universes Beyond reprint) is used: the deck's list chose it.
 */
export function createPrintingLookup(queue: Queue) {
  const cache = createLookupCache<CardArt>();
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
const lookupPrinting = createPrintingLookup(queue);

/**
 * The picture of the printing the list of the deck of seat `owner` names for the card `name`; a card with no owner is drawn by name.
 * `pending` while it is asked for, so the card is not first drawn in another printing; `url` null when the list names none, or
 * when Scryfall answers another card or a printing under another name (then the card is drawn by name).
 */
export function useListedArt(
  name: string | null,
  version: ArtVersion,
  owner: number | undefined,
): { readonly pending: boolean; readonly url: string | null } {
  const printing =
    name === null || name === '' || owner === undefined ? null : printingOf(name, owner);
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

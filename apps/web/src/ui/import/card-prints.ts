/**
 * The printings of one card, for the picker of the deck screen's card dialog: one Scryfall search for every paper printing of the
 * card by exact name, newest first. Nothing here is stored: when Scryfall cannot be reached the dialog keeps the printing the deck
 * already carries.
 */
import { createRequestQueue } from '@commander-arena/cards';
import { useEffect, useState } from 'react';

export interface CardPrint {
  readonly id: string;
  readonly setCode: string;
  readonly setName: string;
  readonly collector: string;
  readonly released: string;
  readonly rarity: string;
  /** Extra frames that make a printing look different: "Borderless", "Showcase", "Extended art", "Full art". */
  readonly frames: readonly string[];
  readonly foilOnly: boolean;
  readonly small: string | null;
  readonly normal: string;
  readonly large: string;
}

export function cardPrintsUrl(name: string): string {
  const front = (name.split(' // ')[0] ?? name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `!"${front}" game:paper`;
  return `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`;
}

const HOST = /^https:\/\/cards\.scryfall\.io\//;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function imagesOf(card: Record<string, unknown>): Record<string, unknown> | null {
  const direct = card.image_uris;
  if (typeof direct === 'object' && direct !== null) return direct as Record<string, unknown>;
  const front = Array.isArray(card.card_faces) ? card.card_faces[0] : null;
  const uris = (front as { image_uris?: unknown } | null)?.image_uris;
  return typeof uris === 'object' && uris !== null ? (uris as Record<string, unknown>) : null;
}

/** The printings of a search answer that have a Scryfall-hosted picture; anything else is skipped. */
export function parseCardPrints(answer: unknown): readonly CardPrint[] {
  const data = (answer as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const prints: CardPrint[] = [];
  for (const raw of data) {
    if (typeof raw !== 'object' || raw === null) continue;
    const card = raw as Record<string, unknown>;
    const uris = imagesOf(card);
    const normal = str(uris?.normal);
    const large = str(uris?.large) || normal;
    if (!HOST.test(normal) || !HOST.test(large)) continue;
    const small = str(uris?.small);
    const frameEffects = Array.isArray(card.frame_effects) ? card.frame_effects : [];
    const frames = [
      card.border_color === 'borderless' && 'Borderless',
      frameEffects.includes('showcase') && 'Showcase',
      frameEffects.includes('extendedart') && 'Extended art',
      card.full_art === true && 'Full art',
    ].filter((f): f is string => typeof f === 'string');
    prints.push({
      id: str(card.id),
      setCode: str(card.set).toUpperCase(),
      setName: str(card.set_name),
      collector: str(card.collector_number),
      released: str(card.released_at),
      rarity: str(card.rarity),
      frames,
      foilOnly: card.nonfoil === false,
      small: HOST.test(small) ? small : null,
      normal,
      large,
    });
  }
  return prints;
}

export function printLabel(print: CardPrint): string {
  const extra = print.frames.length > 0 ? ` · ${print.frames.join(', ')}` : '';
  return `${print.setName} #${print.collector}${extra}`;
}

const queue = createRequestQueue({
  fetch: (url, init) => fetch(url, init),
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxErrorRetries: 0,
});
const cache = new Map<string, Promise<readonly CardPrint[]>>();

function loadPrints(name: string): Promise<readonly CardPrint[]> {
  const url = cardPrintsUrl(name);
  let result = cache.get(url);
  if (result === undefined) {
    result = queue
      .request({ url })
      .then((r) => (r.kind === 'response' && r.ok ? parseCardPrints(r.json) : []))
      .catch(() => []);
    cache.set(url, result);
  }
  return result;
}

export type PrintsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly prints: readonly CardPrint[] };

/** The printings of the card `name`, `loading` while asked for; an unreachable Scryfall is `ready` with none. */
export function useCardPrints(name: string): PrintsState {
  const [found, setFound] = useState<{ name: string; prints: readonly CardPrint[] } | null>(null);
  useEffect(() => {
    let alive = true;
    void loadPrints(name).then((prints) => {
      if (alive) setFound({ name, prints });
    });
    return () => {
      alive = false;
    };
  }, [name]);
  return found?.name === name ? { status: 'ready', prints: found.prints } : { status: 'loading' };
}

/** A printing a deck's text lists: set code (any case) and collector number. */
export interface ListedKey {
  readonly set: string;
  readonly collector: string;
}

export const listedKey = (key: ListedKey): string => `${key.set.toLowerCase()}/${key.collector}`;

/** The picture a listed printing is drawn with, and the name of the card it belongs to. */
export interface ListedImage {
  readonly name: string;
  readonly normal: string;
}

/** The printings of a `/cards/collection` answer by `listedKey`; those without a Scryfall-hosted picture are left out. */
export function parseListedImages(answer: unknown): ReadonlyMap<string, ListedImage> {
  const data = (answer as { data?: unknown } | null)?.data;
  const found = new Map<string, ListedImage>();
  if (!Array.isArray(data)) return found;
  for (const raw of data) {
    if (typeof raw !== 'object' || raw === null) continue;
    const card = raw as Record<string, unknown>;
    const normal = str(imagesOf(card)?.normal);
    if (!HOST.test(normal)) continue;
    found.set(listedKey({ set: str(card.set), collector: str(card.collector_number) }), {
      name: str(card.name),
      normal,
    });
  }
  return found;
}

/** Scryfall takes at most 75 identifiers per `/cards/collection` request. */
const BATCH = 75;
const listed = new Map<string, Promise<ListedImage | null>>();

/** The pictures of printings by set and number, in as few requests as possible; a printing Scryfall cannot give is absent. */
export async function loadListedImages(
  keys: readonly ListedKey[],
): Promise<ReadonlyMap<string, ListedImage>> {
  const wanted = [...new Map(keys.map((k) => [listedKey(k), k])).entries()];
  const missing = wanted.filter(([id]) => !listed.has(id));
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const answer = queue
      .request({
        url: 'https://api.scryfall.com/cards/collection',
        method: 'POST',
        json: {
          identifiers: batch.map(([, k]) => ({
            set: k.set.toLowerCase(),
            collector_number: k.collector,
          })),
        },
      })
      .then((r) => (r.kind === 'response' && r.ok ? parseListedImages(r.json) : new Map()))
      .catch(() => new Map<string, ListedImage>());
    for (const [id] of batch)
      listed.set(
        id,
        answer.then((found) => found.get(id) ?? null),
      );
  }
  const out = new Map<string, ListedImage>();
  await Promise.all(
    wanted.map(async ([id]) => {
      const image = await listed.get(id);
      if (image !== null && image !== undefined) out.set(id, image);
    }),
  );
  return out;
}

/** The pictures of the listed printings of a deck, by `listedKey`; empty while asked for or when Scryfall cannot be reached. */
export function useListedImages(keys: readonly ListedKey[]): ReadonlyMap<string, ListedImage> {
  const id = JSON.stringify([...new Set(keys.map(listedKey))].sort());
  const [found, setFound] = useState<{ id: string; images: ReadonlyMap<string, ListedImage> }>({
    id: '',
    images: new Map(),
  });
  useEffect(() => {
    const wanted = (JSON.parse(id) as string[]).map((entry): ListedKey => {
      const cut = entry.indexOf('/');
      return { set: entry.slice(0, cut), collector: entry.slice(cut + 1) };
    });
    if (wanted.length === 0) return;
    let alive = true;
    void loadListedImages(wanted).then((images) => {
      if (alive) setFound({ id, images });
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return found.id === id ? found.images : new Map();
}

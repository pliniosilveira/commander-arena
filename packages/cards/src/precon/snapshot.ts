/**
 * The card-data snapshot of a precon (SPEC 6.2, 15 M9, A16): the decklist as the player would paste
 * it, plus the stored cards it names, so "Quick start" needs no network (card images still load
 * from Scryfall). One JSON file per precon, written by `pnpm precon:snapshot` and read by the web
 * app. The format is deterministic: fixed key order, cards sorted by name, no timestamps (a card's
 * `fetchedAt` is not stored; it is 0 when read back).
 */
import { z } from 'zod';
import type { StoredCard, StoredFace, StoredImageUris } from '../types';

/** A stored card without its fetch time: a snapshot holds no timestamps. */
export type SnapshotCard = Omit<StoredCard, 'fetchedAt'>;

export interface PreconSnapshot {
  /** Lower-case ASCII with dashes; the id the menu and `?autostart=` use. */
  readonly id: string;
  /** The display name. */
  readonly name: string;
  /** One sentence for the menu. */
  readonly blurb: string;
  /** Base name of the Scryfall bulk file the cards came from. */
  readonly source: string;
  /** The decklist exactly as it was given, so a precon replays through the normal import path. */
  readonly decklist: string;
  /** Sorted by name, then oracle id. */
  readonly cards: readonly SnapshotCard[];
}

export const PRECON_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const colors = z.array(z.enum(['W', 'U', 'B', 'R', 'G']));
const nullableText = z.string().nullable();

const imageUris = z.strictObject({
  normal: nullableText,
  large: nullableText,
  artCrop: nullableText,
});

const face = z.strictObject({
  name: z.string(),
  manaCost: z.string(),
  typeLine: z.string(),
  oracleText: z.string(),
  power: nullableText,
  toughness: nullableText,
  loyalty: nullableText,
  defense: nullableText,
  colors,
  imageUris: imageUris.nullable(),
  artist: nullableText,
});

const card = z.strictObject({
  oracleId: z.string().min(1),
  scryfallId: z.string().min(1),
  name: z.string().min(1),
  layout: z.string(),
  faces: z.array(face).min(1),
  cmc: z.number(),
  colorIdentity: colors,
  keywords: z.array(z.string()),
  producedMana: z.array(z.string()),
  commanderLegality: z.enum(['legal', 'not_legal', 'banned', 'restricted']),
  edhrecRank: z.number().nullable(),
  gameChanger: z.boolean().nullable(),
  relatedParts: z.array(z.strictObject({ name: z.string(), component: z.string() })),
});

const snapshot = z.strictObject({
  id: z.string().regex(PRECON_ID_PATTERN),
  name: z.string().min(1),
  blurb: z.string(),
  source: z.string(),
  decklist: z.string().min(1),
  cards: z.array(card),
});

export type SnapshotParse =
  | { readonly ok: true; readonly snapshot: PreconSnapshot }
  | { readonly ok: false; readonly error: string };

/** Reads parsed JSON as a snapshot; never throws, and says what is wrong in one sentence. */
export function parsePreconSnapshot(raw: unknown): SnapshotParse {
  const parsed = snapshot.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue === undefined ? '' : ` (${issue.path.join('.') || 'top level'})`;
    return { ok: false, error: `not a precon snapshot${where}` };
  }
  return { ok: true, snapshot: parsed.data };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function orderedImageUris(uris: StoredImageUris | null): StoredImageUris | null {
  return uris === null ? null : { normal: uris.normal, large: uris.large, artCrop: uris.artCrop };
}

function orderedFace(f: StoredFace): StoredFace {
  return {
    name: f.name,
    manaCost: f.manaCost,
    typeLine: f.typeLine,
    oracleText: f.oracleText,
    power: f.power,
    toughness: f.toughness,
    loyalty: f.loyalty,
    defense: f.defense,
    colors: [...f.colors],
    imageUris: orderedImageUris(f.imageUris),
    artist: f.artist,
  };
}

/** A stored card as the snapshot keeps it: no fetch time, keys in a fixed order. */
export function toSnapshotCard(stored: StoredCard | SnapshotCard): SnapshotCard {
  return {
    oracleId: stored.oracleId,
    scryfallId: stored.scryfallId,
    name: stored.name,
    layout: stored.layout,
    faces: stored.faces.map(orderedFace),
    cmc: stored.cmc,
    colorIdentity: [...stored.colorIdentity],
    keywords: [...stored.keywords],
    producedMana: [...stored.producedMana],
    commanderLegality: stored.commanderLegality,
    edhrecRank: stored.edhrecRank,
    gameChanger: stored.gameChanger,
    relatedParts: stored.relatedParts.map((part) => ({
      name: part.name,
      component: part.component,
    })),
  };
}

/** The card as the import pipeline holds it. `fetchedAt` is 0: the data is the app's own. */
export function fromSnapshotCard(card: SnapshotCard): StoredCard {
  return { ...toSnapshotCard(card), fetchedAt: 0 };
}

/** The snapshot as JSON text: fixed key order, sorted cards, two-space indent, final newline. */
export function serializePreconSnapshot(input: PreconSnapshot): string {
  const cards = input.cards
    .map(toSnapshotCard)
    .sort((a, b) => compare(a.name, b.name) || compare(a.oracleId, b.oracleId));
  const ordered = {
    id: input.id,
    name: input.name,
    blurb: input.blurb,
    source: input.source,
    decklist: input.decklist,
    cards,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

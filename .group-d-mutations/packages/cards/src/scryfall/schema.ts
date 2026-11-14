/**
 * Tolerant schemas for the Scryfall objects the app reads, and the conversion of a card object to
 * a `StoredCard` (SPEC 6.2). Unknown fields are ignored. A field of an unexpected type is treated
 * as absent instead of failing the whole card, but a card without `id`, `oracle_id` or `name` is
 * rejected with a reason: nothing is guessed for those.
 *
 * Field names follow the live API as recorded in D-048, not the SPEC wording.
 */
import { z } from 'zod';
import type {
  ColorLetter,
  CommanderLegality,
  StoredCard,
  StoredFace,
  StoredImageUris,
} from '../types';

// ---------------------------------------------------------------- schemas

/** A string, a null or a missing field; anything else counts as missing. */
const text = z.string().nullish().catch(undefined);
const stringList = z.array(z.string()).nullish().catch(undefined);

const imageUrisSchema = z
  .object({ normal: text, large: text, art_crop: text })
  .nullish()
  .catch(undefined);

export const scryfallFaceSchema = z.object({
  name: text,
  oracle_id: text,
  mana_cost: text,
  type_line: text,
  oracle_text: text,
  power: text,
  toughness: text,
  loyalty: text,
  defense: text,
  colors: stringList,
  image_uris: imageUrisSchema,
  artist: text,
});

const partSchema = z.object({ name: text, component: text });

/** One card object as `/cards/named` returns it and as `/cards/collection` lists it in `data`. */
export const scryfallCardSchema = z.object({
  id: text,
  oracle_id: text,
  name: text,
  layout: text,
  card_faces: z.array(scryfallFaceSchema).nullish().catch(undefined),
  all_parts: z.array(partSchema).nullish().catch(undefined),
  mana_cost: text,
  cmc: z.number().nullish().catch(undefined),
  type_line: text,
  oracle_text: text,
  power: text,
  toughness: text,
  loyalty: text,
  defense: text,
  colors: stringList,
  color_identity: stringList,
  keywords: stringList,
  produced_mana: stringList,
  legalities: z.object({ commander: text }).nullish().catch(undefined),
  edhrec_rank: z.number().nullish().catch(undefined),
  game_changer: z.boolean().nullish().catch(undefined),
  image_uris: imageUrisSchema,
  artist: text,
});

export type ScryfallCard = z.infer<typeof scryfallCardSchema>;

/**
 * The body of `/cards/collection`: `data` holds card objects (parsed one by one later, so a bad
 * card does not hide the others) and `not_found` the identifiers that matched nothing.
 */
export const scryfallCollectionSchema = z.object({
  data: z.array(z.unknown()).catch([]),
  not_found: z
    .array(z.object({ name: text }))
    .nullish()
    .catch(undefined),
});

export const scryfallErrorSchema = z.object({
  object: z.literal('error'),
  status: z.number().nullish().catch(undefined),
  code: text,
  type: text,
  details: text,
});

// ---------------------------------------------------------------- conversion

function isLegality(value: string | null | undefined): value is CommanderLegality {
  return value === 'legal' || value === 'not_legal' || value === 'banned' || value === 'restricted';
}

function colorList(values: readonly string[] | null | undefined): ColorLetter[] {
  const letters: ColorLetter[] = [];
  for (const value of values ?? []) {
    if (value === 'W' || value === 'U' || value === 'B' || value === 'R' || value === 'G') {
      if (!letters.includes(value)) letters.push(value);
    }
  }
  return letters;
}

function imageUris(
  face: z.infer<typeof imageUrisSchema>,
  fallback: z.infer<typeof imageUrisSchema>,
): StoredImageUris | null {
  const uris = face ?? fallback;
  if (!uris) return null;
  return {
    normal: uris.normal ?? null,
    large: uris.large ?? null,
    artCrop: uris.art_crop ?? null,
  };
}

function storedFace(face: z.infer<typeof scryfallFaceSchema>, card: ScryfallCard): StoredFace {
  return {
    name: face.name ?? card.name ?? '',
    manaCost: face.mana_cost ?? '',
    typeLine: face.type_line ?? '',
    oracleText: face.oracle_text ?? '',
    power: face.power ?? null,
    toughness: face.toughness ?? null,
    loyalty: face.loyalty ?? null,
    defense: face.defense ?? null,
    colors: colorList(face.colors),
    // Split and adventure cards share one image that lives at the top level; transform and
    // modal double-faced cards carry one image per face.
    imageUris: imageUris(face.image_uris, card.image_uris),
    artist: face.artist ?? card.artist ?? null,
  };
}

/** A single-faced card has no `card_faces`: its one face is made from the top-level fields. */
function topLevelFace(card: ScryfallCard): StoredFace {
  return {
    name: card.name ?? '',
    manaCost: card.mana_cost ?? '',
    typeLine: card.type_line ?? '',
    oracleText: card.oracle_text ?? '',
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    loyalty: card.loyalty ?? null,
    defense: card.defense ?? null,
    colors: colorList(card.colors),
    imageUris: imageUris(card.image_uris, null),
    artist: card.artist ?? null,
  };
}

export type CardConversion =
  | { readonly card: StoredCard; readonly reason?: undefined }
  | { readonly card: null; readonly reason: string };

/** Like `toStoredCard`, and says why a card was rejected. */
export function parseStoredCard(raw: unknown, fetchedAt: number): CardConversion {
  const parsed = scryfallCardSchema.safeParse(raw);
  if (!parsed.success) return { card: null, reason: 'not a Scryfall card object' };
  const card = parsed.data;
  const faces = card.card_faces ?? [];
  // Reversible cards carry the oracle id on their faces rather than at the top level.
  const oracleId = card.oracle_id ?? faces.find((face) => face.oracle_id)?.oracle_id ?? null;
  const name = card.name?.trim();
  if (!name) return { card: null, reason: 'the card object has no name' };
  if (!oracleId) return { card: null, reason: `${name}: the card object has no oracle_id` };
  if (!card.id) return { card: null, reason: `${name}: the card object has no id` };

  const commander = card.legalities?.commander;
  // A missing or unknown legality is treated as not legal: the deck check then flags the card.
  const commanderLegality: CommanderLegality = isLegality(commander) ? commander : 'not_legal';

  return {
    card: {
      oracleId,
      scryfallId: card.id,
      name,
      layout: card.layout ?? 'unknown',
      faces: faces.length > 0 ? faces.map((face) => storedFace(face, card)) : [topLevelFace(card)],
      cmc: card.cmc ?? 0,
      colorIdentity: colorList(card.color_identity),
      keywords: card.keywords ?? [],
      producedMana: card.produced_mana ?? [],
      commanderLegality,
      edhrecRank: card.edhrec_rank ?? null,
      gameChanger: card.game_changer ?? null,
      relatedParts: (card.all_parts ?? []).flatMap((part) =>
        part.name ? [{ name: part.name, component: part.component ?? '' }] : [],
      ),
      fetchedAt,
    },
  };
}

/** A card object as the app stores it, or null when it lacks `id`, `oracle_id` or `name`. */
export function toStoredCard(raw: unknown, fetchedAt: number): StoredCard | null {
  return parseStoredCard(raw, fetchedAt).card;
}

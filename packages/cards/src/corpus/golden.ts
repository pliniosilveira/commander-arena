/**
 * The golden corpus record (D-066): one real card per line of
 * `packages/cards/test/fixtures/corpus/golden.jsonl`, the Oracle text the parser is measured
 * against in CI without network access. The record is a `StoredCard` without what changes between
 * fetches or is not text (ids, images, artist, produced mana, related parts, the clock).
 *
 * Shared by the golden test and by `pnpm corpus:extract`, which appends cards read from the
 * Scryfall bulk file the owner downloaded.
 */
import { MELD_PART, MELD_RESULT } from '../convert/meld';
import type { StoredCard, StoredFace } from '../types';

export interface GoldenFace {
  readonly name: string;
  readonly manaCost: string;
  readonly typeLine: string;
  readonly oracleText: string;
  readonly power: string | null;
  readonly toughness: string | null;
  readonly loyalty: string | null;
  readonly defense: string | null;
  readonly colors: StoredFace['colors'];
}

export interface GoldenCard {
  /** The Scryfall oracle id; null only for a card whose id is not known (an unverified fixture). */
  readonly oracleId: string | null;
  readonly name: string;
  readonly layout: string;
  readonly colorIdentity: StoredCard['colorIdentity'];
  readonly edhrecRank: number | null;
  readonly faces: readonly GoldenFace[];
  /**
   * Where the text came from, in words: `scryfall-bulk <file>` for cards `corpus:extract` read, or
   * `engine-fixture` for text written by hand from Oracle text and not yet checked against
   * Scryfall.
   */
  readonly source: string;
  /** An acceptance card (a card of the owner's deck): reported apart, outside the hold-out split. */
  readonly acceptance?: true;
  /**
   * The parts of a meld pair the card names in Scryfall's `all_parts` (D-280, CR 712.5): only the entries with the components `meld_part` and `meld_result`, which the
   * importer reads (`convert/meld.ts`; the component names are UNVERIFIED). Left out for every card that has none.
   */
  readonly relatedParts?: readonly { readonly name: string; readonly component: string }[];
  /**
   * The card is in the corpus only because another card of it needs it (D-280: the combined face of a meld pair, which is a card of its own in Scryfall's data and is
   * fetched with the pair): the golden test gives it to the importer as the melded face but does not count it, in any group, as a card of the corpus.
   */
  readonly related?: true;
}

/** The record of a stored card, from the Scryfall bulk file or the app's cache. */
export function toGoldenCard(
  card: StoredCard,
  source: string,
  options: { acceptance?: boolean; related?: boolean } = {},
): GoldenCard {
  const meldParts = card.relatedParts.filter(
    (p) => p.component === MELD_PART || p.component === MELD_RESULT,
  );
  return {
    oracleId: card.oracleId,
    name: card.name,
    layout: card.layout,
    colorIdentity: [...card.colorIdentity],
    edhrecRank: card.edhrecRank,
    faces: card.faces.map((f) => ({
      name: f.name,
      manaCost: f.manaCost,
      typeLine: f.typeLine,
      oracleText: f.oracleText,
      power: f.power,
      toughness: f.toughness,
      loyalty: f.loyalty,
      defense: f.defense,
      colors: [...f.colors],
    })),
    source,
    ...(meldParts.length === 0
      ? {}
      : { relatedParts: meldParts.map((p) => ({ name: p.name, component: p.component })) }),
    ...(options.acceptance === true ? { acceptance: true as const } : {}),
    ...(options.related === true ? { related: true as const } : {}),
  };
}

/**
 * The stored card the importer reads. A missing oracle id becomes a placeholder derived from the
 * name, and the fields the record leaves out (ids, mana value, keywords, legality, which the
 * importer does not read) get neutral placeholders; all of it is used only to run the import and
 * is never written back.
 */
export function fromGoldenCard(golden: GoldenCard): StoredCard {
  return {
    oracleId: golden.oracleId ?? `golden-no-oracle-id:${golden.name}`,
    scryfallId: 'golden-no-scryfall-id',
    name: golden.name,
    layout: golden.layout,
    faces: golden.faces.map((f) => ({ ...f, imageUris: null, artist: null })),
    cmc: 0,
    colorIdentity: [...golden.colorIdentity],
    keywords: [],
    producedMana: [],
    commanderLegality: 'legal',
    edhrecRank: golden.edhrecRank,
    gameChanger: null,
    relatedParts: (golden.relatedParts ?? []).map((p) => ({
      name: p.name,
      component: p.component,
    })),
    fetchedAt: 0,
  };
}

/** One JSON line, keys in a fixed order so the file diffs cleanly. */
export function goldenLine(card: GoldenCard): string {
  return JSON.stringify(card);
}

/** The cards of a golden file's text; blank lines are skipped, a bad line throws with its number. */
export function parseGolden(text: string): GoldenCard[] {
  const cards: GoldenCard[] = [];
  for (const [i, line] of text.split('\n').entries()) {
    if (line.trim() === '') continue;
    try {
      cards.push(JSON.parse(line) as GoldenCard);
    } catch (error) {
      throw new Error(`golden line ${i + 1} is not JSON: ${String(error)}`);
    }
  }
  return cards;
}

/** 32-bit FNV-1a: a stable hash for the split of cards that have no oracle id. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The identity of a golden card: its oracle id, or its name when the id is not known. */
export function goldenKey(card: GoldenCard): string {
  return card.oracleId ?? `name:${card.name}`;
}

export type GoldenGroup = 'training' | 'holdout' | 'acceptance';

/**
 * The deterministic 75/25 split (D-066): the last hex digit of the oracle id, `0` to `b` is
 * training and `c` to `f` is hold-out. A card with no oracle id uses the same rule on a hash of its
 * name. Acceptance cards are outside the split.
 */
export function goldenGroup(card: GoldenCard): GoldenGroup {
  if (card.acceptance === true) return 'acceptance';
  const last = card.oracleId?.slice(-1).toLowerCase() ?? '';
  const digit = /^[0-9a-f]$/.test(last) ? Number.parseInt(last, 16) : fnv1a(goldenKey(card)) % 16;
  return digit >= 12 ? 'holdout' : 'training';
}

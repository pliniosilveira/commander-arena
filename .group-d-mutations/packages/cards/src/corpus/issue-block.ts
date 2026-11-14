/**
 * The card data a support issue carries (D-245): the golden records of a deck's unsupported cards, as the app received them from Scryfall
 * when the deck was imported, in a block of the issue's description. The records are JSON lines, gzip-compressed and written in base64url
 * so that a dozen cards take a few thousand characters (GitHub takes a description of at most 65,536). The web app compresses and writes
 * the block; `pnpm corpus:from-issue` finds it, decompresses it (Node's zlib) and adds the cards to the golden corpus, so the owner does
 * not run `corpus:extract` for them. Compression itself lives with each side (the browser's `CompressionStream`, Node's zlib); this module
 * is the format both read: the words that mark the block, the text that is compressed, and the checks on what comes back.
 */
import { type GoldenCard, goldenLine, parseGolden } from './golden';

/** The words that open the block; the reader finds the block by them. */
export const CARD_DATA_SUMMARY = 'Card data for the golden corpus';

/** How the payload is written: the gzip of `cardDataText`, in base64url (RFC 4648 section 5, no padding needed). */
export const CARD_DATA_ENCODING = 'gzip+base64url';

/** The `source` of a record written by the app: Scryfall's own data, fetched by the player's browser at import. */
export const ISSUE_CARD_SOURCE = 'app import (Scryfall API)';

/**
 * The `source` of a record the deck support workflow fetched from Scryfall itself (D-290), for an issue whose description carries no card data of its own: the
 * workflow looks the names up through the app's Scryfall client, so the data is Scryfall's and not the issue author's.
 */
export const WORKFLOW_CARD_SOURCE = 'deck-support workflow (Scryfall API)';

/**
 * The marker of the comment in which the workflow keeps the card data it fetched (D-290). Only a comment of `github-actions[bot]` that carries it counts: anyone can
 * write the words, nobody else can write as the bot.
 */
export const CARD_DATA_COMMENT_MARKER = '<!-- deck-support-card-data -->';

/** The text that is compressed: one golden record per line. */
export function cardDataText(records: readonly GoldenCard[]): string {
  return records.map(goldenLine).join('\n');
}

/** The block around an encoded payload: a collapsed section, the payload in lines of 76 characters inside a fenced block. */
export function cardDataBlock(payload: string, count: number): string {
  const lines: string[] = [];
  for (let i = 0; i < payload.length; i += 76) lines.push(payload.slice(i, i + 76));
  return [
    '<details>',
    `<summary>${CARD_DATA_SUMMARY} (${count} card(s), ${CARD_DATA_ENCODING})</summary>`,
    '',
    '```text',
    ...lines,
    '```',
    '',
    '</details>',
  ].join('\n');
}

/**
 * The payload of the block in an issue's description, its line breaks removed, or null when the description has no block. Throws when
 * the block is open, or holds a character that base64url does not use, so nothing half-read reaches the corpus.
 */
export function cardDataPayload(description: string): string | null {
  const lines = description.split(/\r?\n/);
  const summary = lines.findIndex((line) => line.includes(CARD_DATA_SUMMARY));
  if (summary < 0) return null;
  const open = lines.findIndex((line, i) => i > summary && line.trim() === '```text');
  if (open < 0) return null;
  const close = lines.findIndex((line, i) => i > open && line.trim() === '```');
  if (close < 0) throw new Error('the card data block is not closed');
  const payload = lines
    .slice(open + 1, close)
    .map((line) => line.trim())
    .join('');
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(payload)) {
    throw new Error('the card data block holds characters that base64url does not use');
  }
  return payload;
}

const FACE_STRINGS = ['name', 'manaCost', 'typeLine', 'oracleText'] as const;
const FACE_NULLABLES = ['power', 'toughness', 'loyalty', 'defense'] as const;

/** Why a record is not a well-formed golden card from the app, or null when it is. */
function problem(card: GoldenCard): string | null {
  const value = card as unknown as Record<string, unknown>;
  if (typeof value.oracleId !== 'string' || value.oracleId === '') return 'it has no oracle id';
  if (typeof value.name !== 'string' || value.name === '') return 'it has no name';
  if (typeof value.layout !== 'string') return 'it has no layout';
  if (!Array.isArray(value.colorIdentity)) return 'it has no color identity';
  if (value.edhrecRank !== null && typeof value.edhrecRank !== 'number') {
    return 'its rank is not a number';
  }
  if (!Array.isArray(value.faces) || value.faces.length === 0) return 'it has no face';
  for (const face of value.faces as unknown[]) {
    const f = (face ?? {}) as Record<string, unknown>;
    if (FACE_STRINGS.some((key) => typeof f[key] !== 'string')) {
      return 'a face lacks its text fields';
    }
    if (FACE_NULLABLES.some((key) => f[key] !== null && typeof f[key] !== 'string')) {
      return 'a face has a bad power, toughness, loyalty or defense';
    }
    if (!Array.isArray(f.colors)) return 'a face has no colors';
  }
  return null;
}

/** The records of the decompressed text. Throws, naming the line, when one is not a card the app wrote. */
export function parseCardDataText(text: string): GoldenCard[] {
  const records = parseGolden(text);
  for (const [i, card] of records.entries()) {
    const why = problem(card);
    if (why !== null) {
      throw new Error(`card data line ${i + 1} is not a card the app wrote: ${why}`);
    }
  }
  return records;
}

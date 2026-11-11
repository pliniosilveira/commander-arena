/**
 * Card-name normalization for pasted decklists (SPEC 6.1). Pure string functions with no
 * dependencies, shared by the line scanner and by `canonicalDeck`.
 */

const APOSTROPHES = /[‘’‚‛′ʼ´`]/g;
const DOUBLE_QUOTES = /[“”„‟″«»]/g;
// Hyphen, non-breaking hyphen, figure dash, en dash and the minus sign all stand for "-".
const DASHES = /[‐-–−]/g;
const INVISIBLES = /[​-‍⁠﻿]/g;
// Any run of slashes (`/`, `//`, `///`) with the spaces around it separates two faces.
const FACE_SEPARATOR = /\s*\/+\s*/;

/** The separator Scryfall uses between the faces of a split, double-faced or similar card. */
export const FACE_JOINER = ' // ';

/**
 * Normalize a card name the way Scryfall's `name` field spells it: Unicode NFC, straight quotes
 * and apostrophes, plain hyphens, single spaces, and ` // ` between faces. Case is kept.
 */
export function normalizeCardName(raw: string): string {
  const cleaned = raw
    .normalize('NFC')
    .replace(INVISIBLES, '')
    .replace(APOSTROPHES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .split(FACE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(FACE_JOINER);
}

/**
 * The front-face name: the part before the first ` // `. Scryfall's collection endpoint matches
 * double-faced and split cards only by this name (D-048).
 */
export function frontFaceName(name: string): string {
  const normalized = normalizeCardName(name);
  const at = normalized.indexOf(FACE_JOINER);
  return at === -1 ? normalized : normalized.slice(0, at);
}

/** Code-unit string order: stable on every platform, unlike a locale-aware comparison. */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

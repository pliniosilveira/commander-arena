/**
 * Card-name helpers of the Scryfall client. They are built on the decklist parser's normalization
 * (`normalizeCardName`), so a name the parser hands over and the key of the result map always
 * agree: curly quotes straight, whitespace collapsed, ` // ` between the faces of a multi-faced
 * card.
 */
import { frontFaceName as frontFace, normalizeCardName } from '../decklist/normalize';

/** Lookup key of a card name: the form used for cache keys and for the keys of `found`. */
export function normalizeNameKey(name: string): string {
  return normalizeCardName(name).toLowerCase();
}

/**
 * The name Scryfall's collection endpoint matches for a multi-faced card: the part before the
 * first ` // ` (D-048: the full `A // B` name does not match for transform, split, adventure and
 * modal double-faced cards). A single-faced name is returned unchanged (quotes straightened).
 */
export function frontFaceName(name: string): string {
  return frontFace(name);
}

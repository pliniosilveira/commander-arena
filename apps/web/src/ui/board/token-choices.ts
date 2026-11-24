/**
 * The art the player chose for a token on the deck screen. A token is the same on every card that makes it, so the choice is kept
 * by what the token is (its search, as `tokenSearchQuery` writes it, and its rules text), not by deck: the board draws the chosen
 * picture wherever that token appears. Kept in this browser only; a browser that refuses storage just draws the default art.
 */
import { tokenSearchQuery } from '@commander-arena/cards';
import type { TokenDefinition } from '@commander-arena/engine';
import type { CardArt } from './image-uris';
import { parseCardArt } from './image-uris';

const STORAGE_KEY = 'commander-arena.token-art';

/** What makes a token the same token for the player: null for a token that has no token card to choose art of. */
export function tokenChoiceKey(token: TokenDefinition): string | null {
  const query = tokenSearchQuery(token);
  return query === null ? null : `${query}\n${token.oracleText}`;
}

let cache: Record<string, CardArt> | null = null;

function read(): Record<string, CardArt> {
  if (cache !== null) return cache;
  const found: Record<string, CardArt> = {};
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}');
    if (typeof raw === 'object' && raw !== null) {
      for (const [key, value] of Object.entries(raw)) {
        // Only Scryfall-hosted https pictures are ever drawn, whatever the storage holds.
        const art = parseCardArt({ image_uris: value });
        if (art !== null) found[key] = art;
      }
    }
  } catch {
    // Storage unavailable or damaged: no choices.
  }
  cache = found;
  return found;
}

export function chosenTokenArt(key: string | null): CardArt | null {
  return key === null ? null : (read()[key] ?? null);
}

/** Remembers the art for a token, or forgets it with `null`. */
export function chooseTokenArt(key: string, art: CardArt | null): void {
  const next = { ...read() };
  if (art === null) delete next[key];
  else next[key] = art;
  cache = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Kept for this visit only.
  }
}

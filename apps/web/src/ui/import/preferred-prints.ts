/**
 * The printing the player chose "for all decks" on the deck screen, kept by card name in this browser only. A deck imported later
 * gets it written on the card's line (`withPreferredPrintings`), so re-importing almost the same deck keeps the art chosen before.
 * A browser that refuses storage just keeps the choices for this visit.
 */
import { frontFaceName } from '@commander-arena/cards';

const STORAGE_KEY = 'commander-arena.preferred-prints';

export interface PreferredPrint {
  /** Lower-case set code. */
  readonly set: string;
  readonly collector: string;
}

const keyOf = (name: string): string => frontFaceName(name).toLowerCase();
let cache: Record<string, PreferredPrint> | null = null;

function read(): Record<string, PreferredPrint> {
  if (cache !== null) return cache;
  const found: Record<string, PreferredPrint> = {};
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}');
    if (typeof raw === 'object' && raw !== null) {
      for (const [key, value] of Object.entries(raw)) {
        const v: unknown = value;
        if (
          typeof v === 'object' &&
          v !== null &&
          'set' in v &&
          'collector' in v &&
          typeof v.set === 'string' &&
          typeof v.collector === 'string'
        ) {
          found[key] = { set: v.set, collector: v.collector };
        }
      }
    }
  } catch {
    // Storage unavailable or damaged: no preferences.
  }
  cache = found;
  return found;
}

export const preferredPrints = (): ReadonlyMap<string, PreferredPrint> =>
  new Map(Object.entries(read()));

/** Remembers the printing for every deck of this browser, now and later. */
export function preferPrint(name: string, set: string, collector: string): void {
  const next = { ...read(), [keyOf(name)]: { set: set.toLowerCase(), collector } };
  cache = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Kept for this visit only.
  }
}

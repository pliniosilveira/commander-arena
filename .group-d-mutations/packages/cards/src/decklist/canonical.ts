/**
 * Canonical form of a parsed decklist: duplicate lines merged and a stable order, so every export
 * format of the same deck compares equal (SPEC test 27).
 */
import type { DeckSection, ParsedDecklist } from '../types';
import { compareStrings, frontFaceName } from './normalize';

/** One card of a canonical deck. `name` is the front-face name (D-048). */
export interface CanonicalEntry {
  readonly name: string;
  readonly count: number;
  /** Line of the first occurrence in the pasted text. */
  readonly line: number;
  /** Union of the tags of every merged line, sorted. */
  readonly tags: readonly string[];
}

export type CanonicalDeck = Readonly<Record<DeckSection, readonly CanonicalEntry[]>>;

const SECTIONS: readonly DeckSection[] = [
  'commander',
  'main',
  'sideboard',
  'maybeboard',
  'companion',
];

/**
 * Merge lines of the same card within each section (counts add, the smallest line number is
 * kept) and sort by name. Cards are the same when their front-face names match ignoring case, so
 * `Fire // Ice`, `Fire/Ice` and `Fire` merge. The output does not depend on the input order.
 */
export function canonicalDeck(parsed: ParsedDecklist): CanonicalDeck {
  const result = {} as Record<DeckSection, readonly CanonicalEntry[]>;
  for (const section of SECTIONS) {
    const merged = new Map<
      string,
      { names: string[]; count: number; line: number; tags: Set<string> }
    >();
    for (const entry of parsed.sections[section]) {
      const front = frontFaceName(entry.name);
      const key = front.toLowerCase();
      const slot = merged.get(key) ?? { names: [], count: 0, line: entry.line, tags: new Set() };
      slot.names.push(front);
      slot.count += entry.count;
      slot.line = Math.min(slot.line, entry.line);
      for (const tag of entry.tags) slot.tags.add(tag);
      merged.set(key, slot);
    }
    result[section] = [...merged.entries()]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([, slot]) => ({
        // The smallest spelling by code units, so differing letter case merges deterministically.
        name: [...slot.names].sort(compareStrings)[0] ?? '',
        count: slot.count,
        line: slot.line,
        tags: [...slot.tags].sort(compareStrings),
      }));
  }
  return result;
}

/** Total number of cards in the given sections (default: the commander and main deck). */
export function deckSize(
  parsed: ParsedDecklist,
  sections: readonly DeckSection[] = ['commander', 'main'],
): number {
  let total = 0;
  for (const section of sections) {
    for (const entry of parsed.sections[section]) total += entry.count;
  }
  return total;
}

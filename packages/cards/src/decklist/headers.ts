/**
 * Section-header recognition for pasted decklists (SPEC 6.1). A header is a line that is only a
 * section word, in any case, with an optional trailing colon or count: `Commander`, `SIDEBOARD:`,
 * `Deck (99)`, `## Maybeboard`, `**Sideboard**`.
 */
import type { DeckSection } from '../types';

/** What a header selects: a real section, Arena's metadata block, or an ignored section. */
export type HeaderKind = DeckSection | 'meta' | 'tokens';

const HEADER_WORDS: ReadonlyMap<string, HeaderKind> = new Map<string, HeaderKind>([
  ['commander', 'commander'],
  ['commanders', 'commander'],
  ['deck', 'main'],
  ['main', 'main'],
  ['mainboard', 'main'],
  ['main deck', 'main'],
  ['maindeck', 'main'],
  ['library', 'main'],
  ['sideboard', 'sideboard'],
  ['side board', 'sideboard'],
  ['side', 'sideboard'],
  ['sb', 'sideboard'],
  ['companion', 'companion'],
  ['companions', 'companion'],
  ['maybeboard', 'maybeboard'],
  ['maybe board', 'maybeboard'],
  ['maybe', 'maybeboard'],
  // Moxfield and Archidekt call the maybeboard "Considering" in some exports.
  ['considering', 'maybeboard'],
  ['tokens', 'tokens'],
  ['token', 'tokens'],
  ['about', 'meta'],
]);

/** The header a (trimmed, non-empty) line names, or null when the line is not a header. */
export function detectHeader(line: string): HeaderKind | null {
  let word = line.replace(/^#{1,6}\s+/, '').trim();
  // Markdown emphasis around the word: `**Commander**`, `_Sideboard_`.
  word = word.replace(/^[*_]+/, '').replace(/[*_]+$/, '');
  word = word
    .replace(/:\s*$/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/:\s*$/, '');
  word = word.trim().replace(/\s+/g, ' ').toLowerCase();
  return HEADER_WORDS.get(word) ?? null;
}

/**
 * Decklist parsing (SPEC 6.1): section and line handling on top of the entry scanner. Never
 * throws; a line that cannot be understood is reported with its 1-based line number.
 */
import type { DeckEntry, DeckSection, ParsedDecklist, ParseError } from '../types';
import { detectHeader, type HeaderKind } from './headers';
import { scanEntry } from './scan';

/** Something worth telling the user that is not an error, such as an ignored section. */
export interface DeckNote {
  readonly line: number;
  readonly message: string;
}

export interface DecklistParseResult {
  readonly parsed: ParsedDecklist;
  readonly notes: readonly DeckNote[];
}

const LINE_BREAK = /\r\n|\r|\n/;
const SIDEBOARD_PREFIX = /^sb\s*:\s*/i;

function isComment(line: string): boolean {
  return line.startsWith('//');
}

/**
 * Parse pasted decklist text. Same as `parseDecklist` but also returns informational notes.
 *
 * Section rules: an explicit header (`Commander`, `Deck`, `Sideboard:` and so on) selects the
 * section for the lines after it. Arena's `About` block is skipped, and a `Tokens` section is
 * skipped with a note. In a text with no header other than `Deck`/`About` and no `SB:` line, the
 * first blank line after main-deck cards starts the sideboard (the MTGO and old Arena layout).
 */
export function parseDecklistDetailed(text: string): DecklistParseResult {
  const lines = text.split(LINE_BREAK);
  const sections: Record<DeckSection, DeckEntry[]> = {
    commander: [],
    main: [],
    sideboard: [],
    maybeboard: [],
    companion: [],
  };
  const errors: ParseError[] = [];
  const notes: DeckNote[] = [];

  // Pre-scan: explicit section markers turn off the blank-line sideboard rule.
  const explicitSections = lines.some((raw) => {
    const line = raw.trim();
    if (line === '' || isComment(line)) return false;
    if (SIDEBOARD_PREFIX.test(line) && line.replace(SIDEBOARD_PREFIX, '') !== '') return true;
    const header = detectHeader(line);
    return header !== null && header !== 'main' && header !== 'meta';
  });

  let section: HeaderKind = 'main';
  let mainCards = 0;
  let hasCommanderMarking = false;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    const lineNumber = index + 1;
    let line = raw.trim();

    if (line === '') {
      if (!explicitSections && section === 'main' && mainCards > 0) section = 'sideboard';
      continue;
    }
    if (isComment(line)) continue;

    const header = detectHeader(line);
    if (header !== null) {
      section = header;
      if (header === 'commander') hasCommanderMarking = true;
      if (header === 'tokens') {
        notes.push({ line: lineNumber, message: 'Tokens section ignored: the game makes tokens.' });
      }
      continue;
    }
    if (section === 'meta' || section === 'tokens') continue;

    const sideboardPrefix = SIDEBOARD_PREFIX.test(line);
    if (sideboardPrefix) line = line.replace(SIDEBOARD_PREFIX, '');

    const scanned = scanEntry(line);
    if (!scanned.ok) {
      errors.push({ line: lineNumber, text: raw.replace(/^﻿/, ''), message: scanned.message });
      continue;
    }
    const { entry } = scanned;
    let target: DeckSection = sideboardPrefix ? 'sideboard' : section;
    if (entry.commander) {
      target = 'commander';
      hasCommanderMarking = true;
    } else if (entry.sectionTag !== null) {
      target = entry.sectionTag;
    }
    if (target === 'main') mainCards += 1;
    sections[target].push({
      name: entry.name,
      count: entry.count,
      line: lineNumber,
      set: entry.set,
      collector: entry.collector,
      tags: entry.tags,
      foil: entry.foil,
    });
  }

  return { parsed: { sections, hasCommanderMarking, errors }, notes };
}

/** Parse pasted decklist text in the Arena, MTGO, Moxfield or Archidekt export format. */
export function parseDecklist(text: string): ParsedDecklist {
  return parseDecklistDetailed(text).parsed;
}

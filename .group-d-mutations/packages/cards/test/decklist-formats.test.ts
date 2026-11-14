/**
 * SPEC test 27: each export-format fixture parses to the same canonical deck, and unparseable
 * lines are reported with line numbers.
 *
 * The fixtures in `fixtures/decklist-*.txt` were written by hand from the known shape of each
 * export format (Arena, MTGO, Moxfield, Archidekt). They are NOT copied exports: the card names
 * are real, but the set codes and collector numbers are illustrative and may not match real
 * printings. `.txt` has no comment syntax for every format, so the note lives here. The Arena
 * fixture starts with a byte order mark and the Archidekt fixture uses Windows line endings on
 * purpose.
 */
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import type { CanonicalDeck } from '../src/decklist/index';
import {
  canonicalDeck,
  deckSize,
  parseDecklist,
  parseDecklistDetailed,
} from '../src/decklist/index';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

const MAIN = [
  ['Arcane Signet', 1],
  ['Brainstorm', 1],
  ['Command Tower', 1],
  ['Counterspell', 1],
  ['Delver of Secrets', 1],
  ['Fire', 1],
  ['Forest', 4],
  ['Island', 5],
  ['Jötun Grunt', 1],
  ["Lim-Dûl's Vault", 1],
  ['Sol Ring', 1],
  ['Swamp', 3],
] as const;
const COMMANDER = "Atraxa, Praetors' Voice";

/** Name and count only: lines, tags and printings differ between formats. */
function cards(deck: CanonicalDeck, section: keyof CanonicalDeck): [string, number][] {
  return deck[section].map((entry) => [entry.name, entry.count]);
}

/** Every card of every section, merged: for formats that cannot mark a commander. */
function everyCard(deck: CanonicalDeck): [string, number][] {
  const total = new Map<string, number>();
  for (const entries of Object.values(deck)) {
    for (const entry of entries) total.set(entry.name, (total.get(entry.name) ?? 0) + entry.count);
  }
  return [...total.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

const MARKED = ['decklist-arena.txt', 'decklist-moxfield.txt', 'decklist-archidekt.txt'];

describe('export-format fixtures', () => {
  test.each(MARKED)('%s parses with no errors to the canonical deck', (file) => {
    const parsed = parseDecklist(fixture(file));
    expect(parsed.errors).toEqual([]);
    expect(parsed.hasCommanderMarking).toBe(true);
    const deck = canonicalDeck(parsed);
    expect(cards(deck, 'commander')).toEqual([[COMMANDER, 1]]);
    expect(cards(deck, 'main')).toEqual(MAIN.map(([n, c]) => [n, c]));
    expect(cards(deck, 'sideboard')).toEqual([['Rhystic Study', 1]]);
    expect(cards(deck, 'maybeboard')).toEqual([]);
    expect(deckSize(parsed)).toBe(22);
  });

  test('MTGO has no commander marking: the commander sits in the sideboard', () => {
    const parsed = parseDecklist(fixture('decklist-mtgo.txt'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.hasCommanderMarking).toBe(false);
    const deck = canonicalDeck(parsed);
    expect(cards(deck, 'commander')).toEqual([]);
    expect(cards(deck, 'main')).toEqual(MAIN.map(([n, c]) => [n, c]));
    expect(cards(deck, 'sideboard')).toEqual([
      [COMMANDER, 1],
      ['Rhystic Study', 1],
    ]);
  });

  test('all four formats hold the same cards overall', () => {
    const files = [...MARKED, 'decklist-mtgo.txt'];
    const [first, ...others] = files.map((f) =>
      everyCard(canonicalDeck(parseDecklist(fixture(f)))),
    );
    expect(first?.length).toBe(MAIN.length + 2);
    for (const other of others) expect(other).toEqual(first);
  });

  test('printing details survive in the entries', () => {
    const arena = parseDecklist(fixture('decklist-arena.txt'));
    expect(arena.sections.main[0]).toMatchObject({
      name: 'Sol Ring',
      count: 1,
      set: 'cmr',
      collector: '472',
      line: 8,
      foil: false,
      tags: [],
    });
    const moxfield = parseDecklist(fixture('decklist-moxfield.txt'));
    const foils = moxfield.sections.main.filter((e) => e.foil).map((e) => e.name);
    expect(foils).toEqual(['Sol Ring', 'Command Tower']);
    expect(moxfield.sections.commander[0]?.name).toBe(COMMANDER);
    const archidekt = parseDecklist(fixture('decklist-archidekt.txt'));
    expect(archidekt.sections.main[0]?.tags).toEqual(['Ramp', 'Have']);
    expect(archidekt.sections.commander[0]?.tags).toEqual(['Commander']);
  });

  test('split and double-faced names normalize to " // "', () => {
    const names = (file: string): string[] =>
      Object.values(parseDecklist(fixture(file)).sections)
        .flat()
        .map((e) => e.name)
        .filter((n) => n.includes('//'));
    for (const file of [...MARKED, 'decklist-mtgo.txt']) {
      expect(names(file)).toEqual(['Fire // Ice', 'Delver of Secrets // Insectile Aberration']);
    }
  });
});

describe('error reporting', () => {
  test('unparseable lines come back with exact line numbers and the rest still parses', () => {
    const text = [
      'Commander', // 1
      '1 Atraxa, Praetors’ Voice (C16) 28', // 2
      '', // 3
      'Deck', // 4
      '0 Sol Ring', // 5: quantity 0
      '1 Arcane Signet (CMR', // 6: unclosed parenthesis
      '1x', // 7: no name
      '1 Command Tower [Land', // 8: unclosed bracket
      '1 Brainstorm', // 9: fine
      '-2 Counterspell', // 10: negative quantity
      '1.5 Island', // 11: fractional quantity
      '1 Forest (CMR) 1003 trailing words', // 12: text after the details
    ].join('\n');
    const result = parseDecklist(text);
    expect(result.errors.map((e) => e.line)).toEqual([5, 6, 7, 8, 10, 11, 12]);
    expect(result.errors.map((e) => e.text)).toEqual([
      '0 Sol Ring',
      '1 Arcane Signet (CMR',
      '1x',
      '1 Command Tower [Land',
      '-2 Counterspell',
      '1.5 Island',
      '1 Forest (CMR) 1003 trailing words',
    ]);
    expect(result.sections.commander.map((e) => e.name)).toEqual([COMMANDER]);
    expect(result.sections.main.map((e) => e.name)).toEqual(['Brainstorm']);
  });

  test('line numbers count Windows line endings and a BOM once', () => {
    const result = parseDecklist('﻿1 Sol Ring\r\n\r\n0 Island\r\n1 Swamp');
    expect(result.errors).toEqual([
      { line: 3, text: '0 Island', message: 'quantity must be at least 1' },
    ]);
    // The blank line on line 2 starts the sideboard (no headers in this text).
    expect(result.sections.main.map((e) => [e.name, e.line])).toEqual([['Sol Ring', 1]]);
    expect(result.sections.sideboard.map((e) => [e.name, e.line])).toEqual([['Swamp', 4]]);
  });

  test('a BOM in front of a bad first line is not part of the reported text', () => {
    expect(parseDecklist('﻿0 Sol Ring').errors[0]).toMatchObject({ line: 1, text: '0 Sol Ring' });
  });
});

describe('properties', () => {
  test('parseDecklist never throws and error lines stay inside the text', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const result = parseDecklist(text);
        const lineCount = text.split(/\r\n|\r|\n/).length;
        for (const error of result.errors) {
          expect(error.line).toBeGreaterThanOrEqual(1);
          expect(error.line).toBeLessThanOrEqual(lineCount);
        }
        for (const entries of Object.values(result.sections)) {
          for (const entry of entries) {
            expect(entry.line).toBeGreaterThanOrEqual(1);
            expect(entry.line).toBeLessThanOrEqual(lineCount);
            expect(entry.count).toBeGreaterThanOrEqual(1);
            expect(entry.name.length).toBeGreaterThan(0);
          }
        }
        canonicalDeck(result);
      }),
      { numRuns: 500 },
    );
  });

  test('never throws on decklist-shaped noise either', () => {
    const piece = fc.constantFrom(
      '1',
      '2x',
      ' ',
      '\t',
      '(',
      ')',
      '[',
      ']',
      '^',
      '*',
      '#',
      '//',
      '/',
      'SB:',
      'Sideboard',
      'Commander',
      ':',
      'Sol Ring',
      '’',
      '\n',
      '\r\n',
      '0',
    );
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 40 }), (pieces) => {
        const text = pieces.join('');
        const result = parseDecklistDetailed(text);
        const lineCount = text.split(/\r\n|\r|\n/).length;
        for (const error of result.parsed.errors) expect(error.line).toBeLessThanOrEqual(lineCount);
      }),
      { numRuns: 500 },
    );
  });

  test('canonicalDeck does not depend on the order of the lines', () => {
    const lines = fixture('decklist-moxfield.txt')
      .split('\n')
      .filter((l) => /^\d/.test(l));
    fc.assert(
      fc.property(fc.shuffledSubarray(lines, { minLength: lines.length }), (shuffled) => {
        const canon = (ls: string[]) => cards(canonicalDeck(parseDecklist(ls.join('\n'))), 'main');
        expect(canon(shuffled)).toEqual(canon(lines));
      }),
    );
  });
});

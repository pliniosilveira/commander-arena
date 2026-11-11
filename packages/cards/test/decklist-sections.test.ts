/** Section handling, comments, notes and canonical form of parsed decklists (SPEC 6.1). */
import { describe, expect, test } from 'vitest';
import {
  canonicalDeck,
  deckSize,
  parseDecklist,
  parseDecklistDetailed,
} from '../src/decklist/index';

function names(text: string, section: Parameters<typeof sectionOf>[1]): string[] {
  return sectionOf(parseDecklist(text), section);
}

function sectionOf(
  parsed: ReturnType<typeof parseDecklist>,
  section: keyof typeof parsed.sections,
) {
  return parsed.sections[section].map((e) => e.name);
}

describe('empty and trivial input', () => {
  test.each(['', '\n', '   \r\n\t\n', '﻿', '// just a comment', 'Deck', 'Commander\n'])(
    '%j has no cards and no errors',
    (text) => {
      const parsed = parseDecklist(text);
      for (const entries of Object.values(parsed.sections)) expect(entries).toEqual([]);
      expect(parsed.errors).toEqual([]);
    },
  );

  test('an empty Commander header still counts as commander marking', () => {
    expect(parseDecklist('Commander\n').hasCommanderMarking).toBe(true);
    expect(parseDecklist('Deck\n').hasCommanderMarking).toBe(false);
  });
});

describe('section headers', () => {
  const spellings: [string, 'commander' | 'main' | 'sideboard' | 'maybeboard' | 'companion'][] = [
    ['Commander', 'commander'],
    ['COMMANDER', 'commander'],
    ['commander:', 'commander'],
    ['Commanders', 'commander'],
    ['Commander (1)', 'commander'],
    ['Deck', 'main'],
    ['Main', 'main'],
    ['Mainboard:', 'main'],
    ['Main Deck', 'main'],
    ['Sideboard', 'sideboard'],
    ['SIDEBOARD:', 'sideboard'],
    ['Side Board', 'sideboard'],
    ['SB:', 'sideboard'],
    ['Sideboard (15)', 'sideboard'],
    ['Companion', 'companion'],
    ['companion :', 'companion'],
    ['Maybeboard', 'maybeboard'],
    ['MAYBEBOARD:', 'maybeboard'],
    ['Maybe', 'maybeboard'],
    ['Considering', 'maybeboard'],
    ['## Maybeboard', 'maybeboard'],
    ['**Sideboard**', 'sideboard'],
  ];

  test.each(spellings)('%j selects the %s section', (header, section) => {
    const parsed = parseDecklist(`${header}\n1 Sol Ring\n1x Arcane Signet (CMR) 297`);
    expect(parsed.errors).toEqual([]);
    expect(sectionOf(parsed, section)).toEqual(['Sol Ring', 'Arcane Signet']);
  });

  test('every section in one paste', () => {
    const text = [
      'Commander',
      '1 Atraxa',
      '',
      'Companion',
      '1 Lurrus of the Dream-Den',
      '',
      'Deck',
      '1 Sol Ring',
      '',
      'Sideboard',
      '1 Rhystic Study',
      '',
      'Maybeboard',
      '1 Mana Crypt',
    ].join('\n');
    const parsed = parseDecklist(text);
    expect(parsed.errors).toEqual([]);
    expect(sectionOf(parsed, 'commander')).toEqual(['Atraxa']);
    expect(sectionOf(parsed, 'companion')).toEqual(['Lurrus of the Dream-Den']);
    expect(sectionOf(parsed, 'main')).toEqual(['Sol Ring']);
    expect(sectionOf(parsed, 'sideboard')).toEqual(['Rhystic Study']);
    expect(sectionOf(parsed, 'maybeboard')).toEqual(['Mana Crypt']);
  });

  test('a line is not mistaken for a header when it has a quantity', () => {
    expect(names('1 Deck of Many Things', 'main')).toEqual(['Deck of Many Things']);
  });

  test('lines before any header are main-deck cards; a leading Deck header changes nothing', () => {
    expect(names('1 Sol Ring', 'main')).toEqual(['Sol Ring']);
    expect(names('Deck\n1 Sol Ring', 'main')).toEqual(['Sol Ring']);
  });
});

describe('blank-line and prefix sideboards', () => {
  test('a blank line after the main deck starts the sideboard (MTGO and old Arena layout)', () => {
    const parsed = parseDecklist('1 Sol Ring\n1 Island\n\n1 Rhystic Study\n\n1 Mana Crypt');
    expect(sectionOf(parsed, 'main')).toEqual(['Sol Ring', 'Island']);
    expect(sectionOf(parsed, 'sideboard')).toEqual(['Rhystic Study', 'Mana Crypt']);
  });

  test('works under a Deck header and with Windows line endings', () => {
    const parsed = parseDecklist('Deck\r\n1 Sol Ring\r\n\r\n1 Rhystic Study\r\n');
    expect(sectionOf(parsed, 'main')).toEqual(['Sol Ring']);
    expect(sectionOf(parsed, 'sideboard')).toEqual(['Rhystic Study']);
  });

  test('leading blank lines do not start the sideboard', () => {
    expect(names('\n\n1 Sol Ring', 'main')).toEqual(['Sol Ring']);
  });

  test('blank lines between explicit sections do not move cards', () => {
    const parsed = parseDecklist(
      'Commander\n1 Atraxa\n\n1 Not A Sideboard Card\n\nDeck\n1 Sol Ring',
    );
    expect(sectionOf(parsed, 'commander')).toEqual(['Atraxa', 'Not A Sideboard Card']);
    expect(sectionOf(parsed, 'sideboard')).toEqual([]);
  });

  test('a Sideboard marker turns the blank-line rule off', () => {
    const parsed = parseDecklist('1 Sol Ring\n\n1 Island\n\nSideboard\n1 Rhystic Study');
    expect(sectionOf(parsed, 'main')).toEqual(['Sol Ring', 'Island']);
    expect(sectionOf(parsed, 'sideboard')).toEqual(['Rhystic Study']);
  });

  test.each(['SB: 1 Rhystic Study', 'sb:1 Rhystic Study', 'SB : 1x Rhystic Study (PCY) 45'])(
    '%j is a sideboard card',
    (line) => {
      const parsed = parseDecklist(`1 Sol Ring\n${line}\n1 Island`);
      expect(parsed.errors).toEqual([]);
      expect(sectionOf(parsed, 'sideboard')).toEqual(['Rhystic Study']);
      expect(sectionOf(parsed, 'main')).toEqual(['Sol Ring', 'Island']);
    },
  );

  test('category tags can move a line to the sideboard or maybeboard', () => {
    const parsed = parseDecklist(
      '1x Sol Ring\n1x Mana Crypt [Maybeboard{noDeck}{noPrice}]\n1x Rhystic Study [Sideboard]',
    );
    expect(sectionOf(parsed, 'main')).toEqual(['Sol Ring']);
    expect(sectionOf(parsed, 'maybeboard')).toEqual(['Mana Crypt']);
    expect(sectionOf(parsed, 'sideboard')).toEqual(['Rhystic Study']);
  });
});

describe('Arena metadata, comments and ignored sections', () => {
  test('About and Name lines are skipped without errors', () => {
    const parsed = parseDecklist(
      'About\nName My Test Deck\nDescription: not a card\n\nDeck\n1 Sol Ring',
    );
    expect(parsed.errors).toEqual([]);
    expect(sectionOf(parsed, 'main')).toEqual(['Sol Ring']);
    expect(sectionOf(parsed, 'sideboard')).toEqual([]);
  });

  test('comment lines are ignored, even between cards', () => {
    const parsed = parseDecklist('// my deck\n1 Sol Ring\n  // another\n//1 Island\n1 Swamp');
    expect(parsed.errors).toEqual([]);
    expect(sectionOf(parsed, 'main')).toEqual(['Sol Ring', 'Swamp']);
  });

  test('a Tokens section is ignored with a note, not an error', () => {
    const text =
      'Deck\n1 Sol Ring\nTokens\n1 Treasure\n1 ??? garbage [\nSideboard\n1 Rhystic Study';
    const result = parseDecklistDetailed(text);
    expect(result.parsed.errors).toEqual([]);
    expect(result.notes).toEqual([
      { line: 3, message: 'Tokens section ignored: the game makes tokens.' },
    ]);
    expect(sectionOf(result.parsed, 'main')).toEqual(['Sol Ring']);
    expect(sectionOf(result.parsed, 'sideboard')).toEqual(['Rhystic Study']);
  });

  test('Considering is the maybeboard', () => {
    expect(names('Deck\n1 Sol Ring\nConsidering\n1 Mana Crypt', 'maybeboard')).toEqual([
      'Mana Crypt',
    ]);
  });
});

describe('whitespace and line endings', () => {
  test('tabs, BOM, CRLF, CR and mixed endings', () => {
    const parsed = parseDecklist('﻿1\tSol Ring\t(CMR)\t472\r\n2x\tIsland\r3 Swamp\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.sections.main.map((e) => [e.name, e.count, e.line, e.set])).toEqual([
      ['Sol Ring', 1, 1, 'cmr'],
      ['Island', 2, 2, null],
      ['Swamp', 3, 3, null],
    ]);
  });
});

describe('canonicalDeck and deckSize', () => {
  test('merges duplicate lines, adds counts and keeps the first line number', () => {
    const parsed = parseDecklist('1 Sol Ring (CMR) 472\n4 Island\n2 Island (CMR) 1001\n1 sol ring');
    const deck = canonicalDeck(parsed);
    expect(deck.main).toEqual([
      { name: 'Island', count: 6, line: 2, tags: [] },
      { name: 'Sol Ring', count: 2, line: 1, tags: [] },
    ]);
  });

  test('merges by front face and unions tags', () => {
    const parsed = parseDecklist('1 Fire [Burn]\n1 Fire // Ice [Split]');
    expect(canonicalDeck(parsed).main).toEqual([
      { name: 'Fire', count: 2, line: 1, tags: ['Burn', 'Split'] },
    ]);
  });

  test('sorts by name and does not depend on the input order', () => {
    const lines = ['1 Zealous Conscripts', '1 Arcane Signet', '1 Sol Ring', '1 Brainstorm'];
    const reversed = [...lines].reverse();
    const a = canonicalDeck(parseDecklist(lines.join('\n'))).main.map((e) => e.name);
    const b = canonicalDeck(parseDecklist(reversed.join('\n'))).main.map((e) => e.name);
    expect(a).toEqual(['Arcane Signet', 'Brainstorm', 'Sol Ring', 'Zealous Conscripts']);
    expect(b).toEqual(a);
  });

  test('keeps sections apart', () => {
    const deck = canonicalDeck(parseDecklist('1 Sol Ring\nSB: 1 Sol Ring'));
    expect(deck.main).toHaveLength(1);
    expect(deck.sideboard).toHaveLength(1);
  });

  test('deckSize counts the commander and main deck by default', () => {
    const parsed = parseDecklist('Commander\n1 Atraxa\nDeck\n1 Sol Ring\n5 Island\nSideboard\n1 X');
    expect(deckSize(parsed)).toBe(7);
    expect(deckSize(parsed, ['main'])).toBe(6);
    expect(deckSize(parsed, ['sideboard', 'maybeboard'])).toBe(1);
  });
});

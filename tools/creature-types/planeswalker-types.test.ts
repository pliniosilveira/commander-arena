// The planeswalker type table of the engine (D-200) is generated from CR 205.3j and from the planeswalker types an applied
// Update Bulletin adds to it. This test reads the sources again and compares, so the table cannot drift from the rules.
import { existsSync, readFileSync } from 'node:fs';
import { PLANESWALKER_TYPES } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { CR_FILE } from './generate.ts';
import {
  BULLETINS_DIR,
  PLANESWALKER_TABLE_FILE,
  parseBulletinPlaneswalkerTypes,
  parseRulePlaneswalkerTypes,
  planeswalkerTypes,
  readBulletins,
  renderPlaneswalkerTable,
} from './generate-planeswalker.ts';

// The Comprehensive Rules are Wizards' text and are not committed (D-246): these checks run where `pnpm rules:fetch` has put the file, and skip elsewhere.
const present = existsSync(CR_FILE) && existsSync(BULLETINS_DIR);
const CR = present ? readFileSync(CR_FILE, 'utf8') : '';

describe.skipIf(!present)('the engine table matches CR 205.3j and the bulletins', () => {
  test('the exported table is exactly what the sources list', () => {
    expect([...PLANESWALKER_TYPES]).toEqual(planeswalkerTypes(CR, readBulletins()));
  });

  test('the generated file is the generator output byte for byte', () => {
    expect(readFileSync(PLANESWALKER_TABLE_FILE, 'utf8')).toBe(
      renderPlaneswalkerTable(planeswalkerTypes(CR, readBulletins())),
    );
  });

  test('the types the cards of the Vraska deck need are there, and the bulletin types too', () => {
    for (const t of [
      'Jace',
      'Vraska',
      'Ugin',
      'Garruk',
      'Teferi',
      'Windgrace',
      'Arzakon',
      'Worzel',
    ]) {
      expect(PLANESWALKER_TYPES, t).toContain(t);
    }
    expect(new Set(PLANESWALKER_TYPES).size).toBe(PLANESWALKER_TYPES.length);
  });
});

describe('the parsers refuse text they do not understand', () => {
  test('a rule with the usual wording parses', () => {
    expect(
      parseRulePlaneswalkerTypes(
        '205.3i x\n205.3j Planeswalkers. The planeswalker types are Ajani, Jace, and Zariel.',
      ),
    ).toEqual(['Ajani', 'Jace', 'Zariel']);
    expect(
      parseBulletinPlaneswalkerTypes(
        '**205.3j** This release added two new planeswalker subtypes: A and B.',
      ),
    ).toEqual(['A', 'B']);
    expect(parseBulletinPlaneswalkerTypes('nothing')).toEqual([]);
  });

  test('a missing rule, changed wording or a stray symbol is an error', () => {
    expect(() => parseRulePlaneswalkerTypes('205.3i nothing')).toThrow(/205\.3j is not in/);
    expect(() => parseRulePlaneswalkerTypes('205.3j Something else.')).toThrow(/list sentence/);
    expect(() =>
      parseRulePlaneswalkerTypes('205.3j The planeswalker types are Ajani, and Ja1e.'),
    ).toThrow(/Unexpected planeswalker type/);
  });
});

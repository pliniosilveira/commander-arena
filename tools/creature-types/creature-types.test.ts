// The creature type table of the engine (D-100) is generated from CR 205.3m in the repository's copy of
// the Comprehensive Rules. This test parses the rules text again and compares, so the table cannot
// drift from the rules: change the rules text or the table without the generator and it fails.
import { existsSync, readFileSync } from 'node:fs';
import { CREATURE_TYPES } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { CR_FILE, parseCreatureTypes, renderTable, TABLE_FILE } from './generate.ts';

// The Comprehensive Rules are Wizards' text and are not committed (D-246): these checks run where `pnpm rules:fetch` has put the file, and skip elsewhere.
const present = existsSync(CR_FILE);
const CR = present ? readFileSync(CR_FILE, 'utf8') : '';

describe.skipIf(!present)('the engine table matches CR 205.3m', () => {
  test('the exported table is exactly what the rules text lists', () => {
    expect([...CREATURE_TYPES]).toEqual(parseCreatureTypes(CR));
  });

  test('the generated file is the generator output byte for byte', () => {
    expect(readFileSync(TABLE_FILE, 'utf8')).toBe(renderTable(parseCreatureTypes(CR)));
  });

  test('the rule names the two-word type, and the table has it as one entry', () => {
    const rule = CR.split('\n').find((l) => l.startsWith('205.3m ')) ?? '';
    expect(rule).toContain('One creature type is two words long: Time Lord.');
    expect(CREATURE_TYPES).toContain('Time Lord');
    expect(CREATURE_TYPES).not.toContain('Time');
    expect(CREATURE_TYPES).not.toContain('Lord');
  });

  test('every creature type the rule lists is in the table, and nothing else is', () => {
    // Re-read independently of the parser: split the list sentence on commas and check each name.
    const rule = CR.split('\n').find((l) => l.startsWith('205.3m ')) ?? '';
    const sentence = rule.slice(rule.indexOf('one word long: ') + 'one word long: '.length);
    const names = sentence
      .replace(/\.$/, '')
      .split(', ')
      .map((n) => n.replace(/^and /, ''));
    expect([...CREATURE_TYPES].sort()).toEqual([...names, 'Time Lord'].sort());
    expect(new Set(CREATURE_TYPES).size).toBe(CREATURE_TYPES.length);
  });
});

describe('the parser refuses rules text it does not understand', () => {
  const rule = (text: string) => `205.3l A line before\n205.3m ${text}\n205.3n After`;

  test('a rule with the usual wording parses, the two-word type placed where it sorts', () => {
    const text = rule(
      'Creatures share their types. One creature type is two words long: Time Lord. All other creature types are one word long: Advisor, Zombie, Tiefling, and Wolf.',
    );
    // Order is the rule's own: the list as written, with "Time Lord" before the first name that sorts after it.
    expect(parseCreatureTypes(text)).toEqual([
      'Advisor',
      'Time Lord',
      'Zombie',
      'Tiefling',
      'Wolf',
    ]);
  });

  test('rule 205.3m missing, its wording changed, a type listed twice or a stray symbol is an error', () => {
    expect(() => parseCreatureTypes('205.3l nothing')).toThrow(/205\.3m is not in/);
    expect(() => parseCreatureTypes(rule('Something else entirely.'))).toThrow(/one-word list/);
    expect(() =>
      parseCreatureTypes(
        rule(
          'One creature type is two words long: Time Lord. All other creature types are one word long: Elf, Elf, and Wolf.',
        ),
      ),
    ).toThrow(/twice/);
    expect(() =>
      parseCreatureTypes(
        rule(
          'One creature type is two words long: Time Lord. All other creature types are one word long: Elf, and Wo1f.',
        ),
      ),
    ).toThrow(/Unexpected creature type/);
    expect(() =>
      parseCreatureTypes(rule('All other creature types are one word long: Elf, and Wolf.')),
    ).toThrow(/two-word/);
  });
});

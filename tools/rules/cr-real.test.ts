// Parses the real Comprehensive Rules committed in docs/rules/ and pins what the parser must get
// right about that exact file. The expected counts were established independently with a
// one-off script over the raw text (rule lines matching /^\d{3}\.\d+\.?\s/, sub-rule lines
// matching /^\d{3}\.\d+[a-z]{1,2}\.?\s/, "Example:" lines, and glossary blocks between the last
// "Glossary" heading and the last "Credits" heading). Two format quirks live in this file and
// must keep parsing: U+2028 (LINE SEPARATOR) inside 205.4c, 509.1b and 25 glossary entries, and
// rule 606.5, the only rule whose number is not followed by a period.
//
// If docs/rules/comprehensive-rules.txt is replaced by a newer CR, update the sha256 and the
// counts here together with docs/rules/RULES_VERSION.md.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseCr } from './cr.ts';
import { getCitation, getRule, listUnparsedLines } from './cr-lookup.ts';
import { CR_FILE } from './paths.ts';

const EXPECTED = {
  sha256: '8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca',
  effectiveDate: '2026-09-25',
  sectionCount: 9,
  subsectionCount: 147,
  ruleCount: 1175,
  subruleCount: 1991,
  exampleCount: 277,
  glossaryCount: 741,
};

const present = existsSync(CR_FILE);

describe.skipIf(!present)('the committed Comprehensive Rules file', () => {
  const raw = present ? readFileSync(CR_FILE) : Buffer.alloc(0);
  const cr = parseCr(raw.toString('utf8'));

  test('is the file recorded in docs/rules/rules-source.json', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(EXPECTED.sha256);
    expect(cr.effectiveDate).toBe(EXPECTED.effectiveDate);
  });

  test('parses completely, with no diagnostics', () => {
    expect(listUnparsedLines(cr)).toEqual([]);
    expect(cr.diagnostics).toEqual([]);
    expect(cr.stats.continuationLineCount).toBe(0);
  });

  test('has the independently counted number of rules, examples and glossary entries', () => {
    const s = cr.stats;
    expect({
      sectionCount: s.sectionCount,
      subsectionCount: s.subsectionCount,
      ruleCount: s.ruleCount,
      subruleCount: s.subruleCount,
      exampleCount: s.exampleCount,
      glossaryCount: s.glossaryCount,
    }).toEqual({
      sectionCount: EXPECTED.sectionCount,
      subsectionCount: EXPECTED.subsectionCount,
      ruleCount: EXPECTED.ruleCount,
      subruleCount: EXPECTED.subruleCount,
      exampleCount: EXPECTED.exampleCount,
      glossaryCount: EXPECTED.glossaryCount,
    });
  });

  test('keeps the rules that contain a U+2028 soft break, as multi-line text', () => {
    for (const number of ['205.4c', '509.1b']) {
      const rule = getRule(cr, number)?.rule;
      expect(rule, number).toBeDefined();
      expect(rule?.text).not.toContain(' ');
      expect(rule?.text).toContain('\n');
    }
  });

  test('keeps 606.5, whose number has no trailing period', () => {
    const rule = getRule(cr, '606.5')?.rule;
    expect(rule?.text.startsWith('If the total cost to activate a loyalty ability')).toBe(true);
    expect(getRule(cr, '606')?.rule.children).toContain('606.5');
  });

  test('rules the SPEC cites exist with the expected titles', () => {
    const cited = [
      ['103.5c', 'Starting the Game'],
      ['302.6', 'Creatures'],
      ['400.7', 'General'],
      ['510.1c', 'Combat Damage Step'],
      ['603.3b', 'Handling Triggered Abilities'],
      ['702.2c', 'Deathtouch'],
      ['702.19b', 'Trample'],
      ['702.124', 'Partner'],
      ['733', 'Handling Illegal Actions'],
      ['806', 'Free-for-All Variant'],
      ['903.8', 'Commander'],
      ['903.9b', 'Commander'],
    ] as const;
    for (const [number, title] of cited) {
      expect(getRule(cr, number), number).toBeDefined();
      expect(getCitation(cr, number), number).toContain(title);
    }
  });
});

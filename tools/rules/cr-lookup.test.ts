// Tests for getRule, searchRules and the glossary lookup, on the SYNTHETIC fixture
// (tools/rules/fixtures/synthetic-cr.txt). Nothing here is Wizards text.

import { describe, expect, test } from 'vitest';
import {
  getCitation,
  getRule,
  lookupGlossary,
  normalizeRuleNumber,
  parseCr,
  searchRules,
  suggestRuleNumbers,
} from './cr.ts';
import { cr, miniDoc, must } from './cr-test-utils.ts';

describe('getRule', () => {
  test('a rule returns its sub-rules in order', () => {
    const found = must(getRule(cr, '702.2'), '702.2');
    expect(found.rule.number).toBe('702.2');
    expect(found.descendants.map((r) => r.number)).toEqual(['702.2a', '702.2b', '702.2c']);
    expect(found.ancestors.map((r) => r.number)).toEqual(['7', '702']);
  });

  test('a sub-rule is a leaf with its own example', () => {
    const found = must(getRule(cr, '702.2b'), '702.2b');
    expect(found.descendants).toEqual([]);
    expect(found.rule.examples).toHaveLength(1);
    expect(found.ancestors.map((r) => r.number)).toEqual(['7', '702', '702.2']);
  });

  test('a subsection returns every rule and sub-rule below it, depth first', () => {
    const found = must(getRule(cr, '702'), '702');
    expect(found.descendants.map((r) => r.number)).toEqual([
      '702.1',
      '702.2',
      '702.2a',
      '702.2b',
      '702.2c',
      '702.3',
      '702.3a',
      '702.3b',
      '702.4',
    ]);
  });

  test('a section returns its subsections and everything below', () => {
    const found = must(getRule(cr, '7'), '7');
    expect(found.ancestors).toEqual([]);
    expect(found.descendants.filter((r) => r.kind === 'subsection').map((r) => r.number)).toEqual([
      '701',
      '702',
      '703',
    ]);
    // 701 (+1.1, 1.2, 1.2a, 1.2b), 702 (+1, 2, 2a-c, 3, 3a-b, 4), 703 (+1, 2): 5 + 10 + 3.
    expect(found.descendants.length).toBe(18);
  });

  test('input is normalized: case, trailing period, prefixes and whitespace', () => {
    for (const input of ['702.2B', ' 702.2b ', 'rule 702.2b', 'CR 702.2b', '702.2b.']) {
      expect(getRule(cr, input)?.rule.number).toBe('702.2b');
    }
    expect(getRule(cr, '702.2.')?.rule.number).toBe('702.2');
  });

  test('unknown or malformed numbers return undefined', () => {
    expect(getRule(cr, '702.99')).toBeUndefined();
    expect(getRule(cr, '999')).toBeUndefined();
    expect(getRule(cr, 'trample')).toBeUndefined();
    expect(getRule(cr, '')).toBeUndefined();
    expect(getRule(cr, '70')).toBeUndefined();
  });

  test('normalizeRuleNumber covers the accepted shapes', () => {
    expect(normalizeRuleNumber('7')).toBe('7');
    expect(normalizeRuleNumber('702')).toBe('702');
    expect(normalizeRuleNumber('702.19')).toBe('702.19');
    expect(normalizeRuleNumber('702.19AB')).toBe('702.19ab');
    expect(normalizeRuleNumber('7.1')).toBeNull();
    expect(normalizeRuleNumber('702.')).toBe('702');
    expect(normalizeRuleNumber('702.19abc')).toBeNull();
  });

  test('citations use the rule title, or the nearest titled ancestor', () => {
    expect(getCitation(cr, '702.2b')).toBe('CR 702.2b (Sprocket)');
    expect(getCitation(cr, '702.2')).toBe('CR 702.2 (Sprocket)');
    expect(getCitation(cr, '100.1')).toBe('CR 100.1 (General)');
    expect(getCitation(cr, '7')).toBe('CR 7 (Additional Rules)');
    expect(getCitation(cr, '4242')).toBeUndefined();
  });

  test('suggestions list numbers under the same rule, subsection or section', () => {
    expect(suggestRuleNumbers(cr, '702.2d')).toEqual(['702.2a', '702.2b', '702.2c']);
    expect(suggestRuleNumbers(cr, '702.9')).toContain('702.1');
    expect(suggestRuleNumbers(cr, '705.1')).toEqual(['701', '702', '703']);
    expect(suggestRuleNumbers(cr, '999.1')).toEqual(['901']);
    expect(suggestRuleNumbers(cr, '399.1')).toEqual([]);
    expect(suggestRuleNumbers(cr, 'nonsense')).toEqual([]);
  });
});

describe('searchRules', () => {
  test('ranks title and glossary-term matches before text matches', () => {
    const hits = searchRules(cr, 'sprocket');
    expect(hits[0]).toMatchObject({ kind: 'rule', number: '702.2', matchedIn: 'title' });
    expect(hits[1]).toMatchObject({
      kind: 'glossary',
      term: 'Sprocket',
      matchedIn: 'glossary-term',
    });
    const firstTextHit = hits.findIndex((h) => h.matchedIn === 'text');
    expect(firstTextHit).toBe(2);
    expect(hits.slice(0, 2).every((h) => h.score >= 1000)).toBe(true);
    expect(hits.slice(2).every((h) => h.score < 1000)).toBe(true);
    // Scores never increase down the list.
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]?.score ?? 0).toBeGreaterThanOrEqual(hits[i]?.score ?? 0);
    }
  });

  test('a whole-word match outranks a substring match', () => {
    const hits = searchRules(cr, 'sprocket');
    const wholeWord = hits.findIndex((h) => h.number === '901.1a');
    const substring = hits.findIndex((h) => h.number === '101.1');
    expect(wholeWord).toBeGreaterThan(-1);
    expect(substring).toBeGreaterThan(wholeWord);
  });

  test('is case-insensitive and folds curly and straight quotes', () => {
    expect(searchRules(cr, 'SPROCKET')[0]?.number).toBe('702.2');
    const straight = searchRules(cr, "can't");
    expect(straight.map((h) => h.number)).toEqual(expect.arrayContaining(['101.2', '702.3b']));
    const curly = searchRules(cr, 'can’t');
    expect(curly.map((h) => h.number)).toEqual(straight.map((h) => h.number));
  });

  test('finds headings by title and ranks them first', () => {
    const hits = searchRules(cr, 'keyword');
    expect(hits[0]).toMatchObject({ number: '701', matchedIn: 'title', title: 'Keyword Actions' });
    expect(hits[1]).toMatchObject({ number: '702', matchedIn: 'title' });
    expect(searchRules(cr, 'golden widget')[0]).toMatchObject({ number: '101' });
  });

  test('matches several words that are not adjacent', () => {
    const hits = searchRules(cr, 'turns clockwise sprocket');
    expect(hits.map((h) => h.number)).toContain('702.2a');
  });

  test('examples and glossary definitions rank below rule text', () => {
    const hits = searchRules(cr, 'cogwheel widget meets');
    expect(hits[0]).toMatchObject({ number: '702.2b', matchedIn: 'example' });
    const gadget = searchRules(cr, 'gadget');
    expect(gadget.map((h) => [h.number ?? h.term, h.matchedIn])).toEqual([
      ['Gadget', 'glossary-term'],
      ['100.2', 'text'],
      ['100.1b', 'example'],
    ]);
  });

  test('snippets are short, single-line excerpts around the match', () => {
    const doc = miniDoc([`100.1. ${'filler '.repeat(60)}needle ${'filler '.repeat(60)}`]);
    const hit = must(searchRules(parseCr(doc), 'needle')[0], 'needle hit');
    expect(hit.snippet).toContain('needle');
    expect(hit.snippet.length).toBeLessThanOrEqual(142);
    expect(hit.snippet.startsWith('…')).toBe(true);
    expect(hit.snippet.endsWith('…')).toBe(true);
    expect(hit.snippet).not.toContain('\n');
  });

  test('limit caps the number of hits, and blank or unmatched queries return nothing', () => {
    expect(searchRules(cr, 'widget', { limit: 3 })).toHaveLength(3);
    expect(searchRules(cr, '   ')).toEqual([]);
    expect(searchRules(cr, '')).toEqual([]);
    expect(searchRules(cr, 'zzzxqv')).toEqual([]);
  });

  test('regular expression characters in the query are treated literally', () => {
    expect(() => searchRules(cr, '(.*[')).not.toThrow();
    expect(searchRules(cr, '.*')).toEqual([]);
  });
});

describe('glossary lookup', () => {
  test('finds an exact entry ignoring case', () => {
    const found = lookupGlossary(cr, 'sprocket');
    expect(found.exact.map((e) => e.term)).toEqual(['Sprocket']);
    expect(found.related).toEqual([]);
  });

  test('finds an entry by any of its comma-separated names', () => {
    expect(lookupGlossary(cr, 'inactive widget').exact.map((e) => e.term)).toEqual([
      'Active Widget, Inactive Widget',
    ]);
  });

  test('reports related entries that merely contain the query', () => {
    const found = lookupGlossary(cr, 'widget');
    expect(found.exact.map((e) => e.term)).toEqual(['Widget']);
    expect(found.related.map((e) => e.term)).toEqual(['Active Widget, Inactive Widget']);
  });

  test('returns nothing for blank or unknown terms', () => {
    expect(lookupGlossary(cr, '')).toEqual({ exact: [], related: [] });
    expect(lookupGlossary(cr, 'trample')).toEqual({ exact: [], related: [] });
  });
});

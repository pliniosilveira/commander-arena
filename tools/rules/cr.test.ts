// Tests for the CR parser: decoding, header, structure, diagnostics and robustness. Lookup helpers
// are tested in cr-lookup.test.ts.
//
// Every input here is SYNTHETIC: either tools/rules/fixtures/synthetic-cr.txt or the small inline
// documents built by miniDoc. None of it is Wizards text, and nothing here proves the parser works
// on the real Comprehensive Rules file (which could not be downloaded when this was written).

import { describe, expect, test } from 'vitest';
import {
  decodeCrBytes,
  getRule,
  getSectionTitle,
  listHeadings,
  listUnparsedLines,
  normalizeCrText,
  parseCr,
  parseEffectiveDate,
  searchRules,
} from './cr.ts';
import { cr, decoded, fixtureBytes, kinds, miniDoc, must } from './cr-test-utils.ts';

describe('the synthetic fixture', () => {
  test('is labelled SYNTHETIC on its first line and keeps the quirks the real file is believed to have', () => {
    expect(fixtureBytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(fixtureBytes.includes(Buffer.from('\r\n'))).toBe(true);
    expect(decoded.encoding).toBe('utf-8-bom');
    const firstLine = decoded.text.split('\r\n')[0] ?? '';
    expect(firstLine).toContain('SYNTHETIC TEST DATA');
    expect(firstLine).toContain('NOT WIZARDS OF THE COAST TEXT');
    expect(decoded.text).toContain('“');
    expect(decoded.text).toContain('’');
  });
});

describe('decoding and normalization', () => {
  test('normalizeCrText strips a BOM, converts CRLF and CR to LF and keeps curly quotes', () => {
    const out = normalizeCrText('﻿one “q”\r\ntwo\rthree\nfour ’');
    expect(out).toBe('one “q”\ntwo\nthree\nfour ’');
  });

  test('decodeCrBytes handles UTF-8 with and without BOM, UTF-16 and Windows-1252', () => {
    const utf8 = new TextEncoder().encode('“quote”');
    expect(decodeCrBytes(utf8)).toEqual({ text: '“quote”', encoding: 'utf-8' });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    expect(decodeCrBytes(withBom)).toEqual({ text: '“quote”', encoding: 'utf-8-bom' });
    // Windows-1252: 0x93 and 0x94 are curly double quotes, 0x92 a curly apostrophe. Invalid UTF-8.
    const cp1252 = new Uint8Array([0x93, 0x71, 0x94, 0x20, 0x77, 0x92, 0x73]);
    expect(decodeCrBytes(cp1252)).toEqual({ text: '“q” w’s', encoding: 'windows-1252' });
    const euroTmEllipsisE = new Uint8Array([0x80, 0x99, 0x85, 0xe9]);
    expect(decodeCrBytes(euroTmEllipsisE).text).toBe('\u20ac\u2122\u2026\u00e9');
    const undefinedBytes = new Uint8Array([0x81, 0x8d, 0x8f, 0x90, 0x9d]);
    expect(decodeCrBytes(undefinedBytes).text).toBe('\u0081\u008d\u008f\u0090\u009d');
    const utf16le = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]);
    expect(decodeCrBytes(utf16le)).toEqual({ text: 'hi', encoding: 'utf-16le' });
    const utf16be = new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]);
    expect(decodeCrBytes(utf16be)).toEqual({ text: 'hi', encoding: 'utf-16be' });
  });

  test('the fixture re-encoded as Windows-1252 decodes and parses to the same structure', () => {
    // Reverse of the Windows-1252 mapping, only for the punctuation the fixture uses.
    const reverse: Record<number, number> = {
      8216: 0x91,
      8217: 0x92,
      8220: 0x93,
      8221: 0x94,
      8211: 0x96,
      8212: 0x97,
      8230: 0x85,
    };
    const body = decoded.text.replace(/^\uFEFF/, '');
    const bytes = Uint8Array.from(body, (ch) => {
      const code = ch.charCodeAt(0);
      const byte = code < 0x80 ? code : reverse[code];
      if (byte === undefined) throw new Error(`fixture uses U+${code.toString(16)}, add it above`);
      return byte;
    });
    const again = decodeCrBytes(bytes);
    expect(again.encoding).toBe('windows-1252');
    expect(again.text).toBe(body);
    expect(JSON.stringify([...parseCr(again.text).rules.values()])).toBe(
      JSON.stringify([...cr.rules.values()]),
    );
  });

  test('parseCr gives identical results for CRLF, LF and CR input, with or without a BOM', () => {
    const lf = normalizeCrText(decoded.text);
    const variants = [lf, lf.replace(/\n/g, '\r\n'), lf.replace(/\n/g, '\r'), `﻿${lf}`];
    const reference = JSON.stringify([...cr.rules.values()]);
    for (const variant of variants) {
      expect(JSON.stringify([...parseCr(variant).rules.values()])).toBe(reference);
    }
  });
});

describe('header information', () => {
  test('finds the title line and the effective date', () => {
    expect(cr.title).toContain('SYNTHETIC TEST DATA');
    expect(cr.effectiveDateText).toBe('March 3, 2099');
    expect(cr.effectiveDate).toBe('2099-03-03');
  });

  test('parseEffectiveDate accepts "Month D, YYYY" and rejects everything else', () => {
    expect(parseEffectiveDate('September 25, 2099')).toBe('2099-09-25');
    expect(parseEffectiveDate('february 29, 2096')).toBe('2096-02-29');
    expect(parseEffectiveDate('February 29, 2099')).toBeNull();
    expect(parseEffectiveDate('Smarch 3, 2099')).toBeNull();
    expect(parseEffectiveDate('3 March 2099')).toBeNull();
    expect(parseEffectiveDate('')).toBeNull();
  });

  test('a date in an unexpected form is kept as text with a null ISO date', () => {
    const parsed = parseCr(
      miniDoc(['100.1. Synthetic rule.']).replace('January 5, 2099', 'the 5th of January'),
    );
    expect(parsed.effectiveDateText).toBe('the 5th of January');
    expect(parsed.effectiveDate).toBeNull();
  });

  test('a missing effective date is reported, not thrown', () => {
    const parsed = parseCr(miniDoc(['100.1. Synthetic rule.']).replace(/These rules.*\n/, ''));
    expect(parsed.effectiveDate).toBeNull();
    expect(kinds(parsed)).toContain('missing-effective-date');
  });
});

describe('structure', () => {
  test('counts match the fixture and every kind is recognized', () => {
    expect(cr.stats).toMatchObject({
      sectionCount: 4,
      subsectionCount: 8,
      ruleCount: 16,
      subruleCount: 12,
      exampleCount: 5,
      glossaryCount: 5,
      unparsedLineCount: 1,
      continuationLineCount: 0,
      creditsLineCount: 2,
    });
    expect(cr.rules.get('7')?.kind).toBe('section');
    expect(cr.rules.get('702')?.kind).toBe('subsection');
    expect(cr.rules.get('702.2')?.kind).toBe('rule');
    expect(cr.rules.get('702.2b')?.kind).toBe('subrule');
  });

  test('the Contents list is recorded separately and does not create duplicate headings', () => {
    expect(cr.contentsTitles.size).toBe(12);
    expect(cr.contentsTitles.get('702')).toBe('Keyword Abilities');
    expect(cr.rules.get('702')?.line).toBeGreaterThan(40);
    expect(cr.diagnostics.filter((d) => d.kind === 'contents-mismatch')).toEqual([]);
  });

  test('section and subsection titles are available', () => {
    expect(getSectionTitle(cr, '7')).toBe('Additional Rules');
    expect(getSectionTitle(cr, '702')).toBe('Keyword Abilities');
    expect(getSectionTitle(cr, '702.2')).toBeUndefined();
    expect(listHeadings(cr, 'section').map((h) => h.number)).toEqual(['1', '2', '7', '9']);
    expect(listHeadings(cr).length).toBe(12);
    expect(listHeadings(cr, 'subsection').map((h) => h.title)).toContain('Turn-Based Widgets');
  });

  test('parents and children follow the numbering, in document order', () => {
    expect(cr.rules.get('702.2b')?.parent).toBe('702.2');
    expect(cr.rules.get('702.2')?.parent).toBe('702');
    expect(cr.rules.get('702')?.parent).toBe('7');
    expect(cr.rules.get('7')?.parent).toBeNull();
    expect(cr.rules.get('702.2')?.children).toEqual(['702.2a', '702.2b', '702.2c']);
    expect(cr.rules.get('702')?.children).toEqual(['702.1', '702.2', '702.3', '702.4']);
    expect(cr.rules.get('7')?.children).toEqual(['701', '702', '703']);
  });

  test('every rule is listed by its parent and numbers are consistent with the hierarchy', () => {
    for (const rule of cr.rules.values()) {
      if (rule.parent === null) {
        expect(rule.kind).toBe('section');
        continue;
      }
      expect(cr.rules.get(rule.parent)?.children).toContain(rule.number);
      expect(rule.number.startsWith(rule.parent)).toBe(true);
    }
  });

  test('rule text keeps curly quotes and strips the trailing number period', () => {
    expect(cr.rules.get('100.1a')?.text).toBe(
      'A synthetic sub-rule about “curly quotes” and a widget’s apostrophe.',
    );
    expect(cr.rules.get('100.1')?.text.startsWith('Synthetic rule about widgets')).toBe(true);
    expect(cr.rules.get('100.1')?.number).toBe('100.1');
  });

  test('examples attach to the rule above them, including after a blank line, and not to the parent', () => {
    expect(cr.rules.get('100.1b')?.examples).toEqual([
      'Synthetic example attached to 100.1b: a widget meets a gadget.',
    ]);
    expect(cr.rules.get('100.1')?.examples).toEqual([]);
    expect(cr.rules.get('100.2')?.examples).toEqual([
      'First synthetic example of 100.2.',
      'Second synthetic example of 100.2.',
    ]);
    expect(cr.rules.get('101.1')?.examples).toEqual([
      'Synthetic example that follows a blank line but still belongs to 101.1.',
    ]);
    expect(cr.rules.get('101.2')?.examples).toEqual([]);
  });

  test('a short non-sentence rule with sub-rules gets a title, others do not', () => {
    expect(cr.rules.get('702.2')?.title).toBe('Sprocket');
    expect(cr.rules.get('701.2')?.title).toBe('Spin');
    expect(cr.rules.get('702.1')?.title).toBeNull();
    expect(cr.rules.get('702.4')?.title).toBeNull();
    expect(cr.rules.get('702.2a')?.title).toBeNull();
    expect(cr.rules.get('702')?.title).toBe('Keyword Abilities');
  });

  test('glossary entries are parsed with names and multi-line definitions', () => {
    expect(cr.glossary.map((g) => g.term)).toEqual([
      'Cogwheel',
      'Sprocket',
      'Widget',
      'Active Widget, Inactive Widget',
      'Gadget',
    ]);
    const widget = must(
      cr.glossary.find((g) => g.term === 'Widget'),
      'Widget',
    );
    expect(widget.definition).toBe(
      '1. A synthetic object used in tests.\n2. The synthetic thing that sprockets turn. See rule 100.1.',
    );
    const pair = must(
      cr.glossary.find((g) => g.term.startsWith('Active')),
      'Active Widget',
    );
    expect(pair.names).toEqual([
      'Active Widget, Inactive Widget',
      'Active Widget',
      'Inactive Widget',
    ]);
  });

  test('text after Credits is counted but not parsed as rules or glossary', () => {
    expect(cr.stats.creditsLineCount).toBe(2);
    expect(cr.glossary.some((g) => g.term.includes('credits'))).toBe(false);
  });
});

describe('diagnostics', () => {
  test('the deliberately odd fixture line is reported with its line number and text', () => {
    const unparsed = listUnparsedLines(cr);
    expect(unparsed).toHaveLength(1);
    const odd = must(unparsed[0], 'odd line');
    const lines = normalizeCrText(decoded.text).split('\n');
    expect(odd.line).toBe(lines.findIndex((l) => l.includes('SYNTHETIC ODD LINE')) + 1);
    expect(odd.text).toContain('SYNTHETIC ODD LINE');
    expect(odd.kind).toBe('unparsed-line');
    // The rule after the odd line is still parsed.
    expect(cr.rules.get('703.2')?.text).toBe('Synthetic rule that follows the odd line above.');
    expect(cr.diagnostics).toHaveLength(1);
  });

  test('a line directly under a rule is appended as a flagged continuation', () => {
    const parsed = parseCr(
      miniDoc([
        '100.1. Synthetic rule that wraps',
        'onto a second line.',
        'Example: Synthetic',
        'wrapped example.',
      ]),
    );
    expect(parsed.rules.get('100.1')?.text).toBe('Synthetic rule that wraps\nonto a second line.');
    expect(parsed.rules.get('100.1')?.examples).toEqual(['Synthetic\nwrapped example.']);
    expect(parsed.stats.continuationLineCount).toBe(2);
    expect(listUnparsedLines(parsed)).toEqual([]);
  });

  test('a stray line after a blank line is unparsed, not attached to the rule above', () => {
    const parsed = parseCr(miniDoc(['100.1. Synthetic rule.', '', 'stray synthetic words']));
    expect(parsed.rules.get('100.1')?.text).toBe('Synthetic rule.');
    expect(listUnparsedLines(parsed).map((d) => d.text)).toEqual(['stray synthetic words']);
  });

  test('an example with no rule above it is an orphan', () => {
    const parsed = parseCr(
      miniDoc(['Example: Synthetic example with nothing above it.', '', '100.1. Rule.']),
    );
    expect(kinds(parsed)).toContain('orphan-example');
    expect(parsed.rules.get('100.1')?.examples).toEqual([]);
  });

  test('a duplicate number keeps the first definition and is reported', () => {
    const parsed = parseCr(
      miniDoc(['100.1. First synthetic text.', '', '100.1. Second synthetic text.']),
    );
    expect(parsed.rules.get('100.1')?.text).toBe('First synthetic text.');
    expect(kinds(parsed)).toContain('duplicate-number');
  });

  test('a rule whose parent is missing attaches to the nearest ancestor and is reported', () => {
    const parsed = parseCr(miniDoc(['100.1a Synthetic sub-rule with no 100.1 above it.']));
    expect(parsed.rules.get('100.1a')?.parent).toBe('100');
    expect(parsed.rules.get('100')?.children).toContain('100.1a');
    expect(kinds(parsed)).toContain('missing-parent');
  });

  test('a glossary term without definition lines is kept and reported', () => {
    const doc = miniDoc(['100.1. Synthetic rule.']).replace(
      'Thing\nA synthetic thing.',
      'Lonely Term\n\nThing\nA synthetic thing.',
    );
    const parsed = parseCr(doc);
    expect(parsed.glossary.map((g) => g.term)).toEqual(['Lonely Term', 'Thing']);
    expect(parsed.glossary[0]?.definition).toBe('');
    expect(kinds(parsed)).toContain('glossary-term-without-definition');
  });

  test('Contents and body headings that disagree are reported', () => {
    const doc = miniDoc(['100.1. Synthetic rule.']).replace(
      '\n100. General\n\n100.1.',
      '\n100. Different Title\n\n100.1.',
    );
    const parsed = parseCr(doc);
    const mismatches = parsed.diagnostics.filter((d) => d.kind === 'contents-mismatch');
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches[0]?.message).toContain('General');
  });

  test('a file with no numbered rules and no glossary says so', () => {
    const parsed = parseCr('Just a title\n\nand some words\n');
    expect(parsed.title).toBe('Just a title');
    expect(kinds(parsed)).toEqual(
      expect.arrayContaining(['no-rules-found', 'no-glossary-found', 'missing-effective-date']),
    );
  });

  test('mojibake and replacement characters are flagged with a line number', () => {
    const brokenQuote = String.fromCharCode(0xe2, 0x20ac, 0x2122);
    const doc = miniDoc([`100.1. Synthetic text with a broken quote: ${brokenQuote} here.`]);
    const mojibake = parseCr(doc);
    const flagged = must(
      mojibake.diagnostics.find((d) => d.kind === 'suspected-mojibake'),
      'mojibake diagnostic',
    );
    expect(flagged.line).toBe(doc.split('\n').findIndex((l) => l.includes('broken quote')) + 1);
    const replacementChar = String.fromCharCode(0xfffd);
    const replacement = parseCr(miniDoc([`100.1. Synthetic text with ${replacementChar} in it.`]));
    expect(kinds(replacement)).toContain('replacement-character');
  });

  test('Glossary or Credits before any rule is not mistaken for the real sections', () => {
    const parsed = parseCr(
      [
        'Synthetic Title',
        '',
        '1. One',
        '100. General',
        'Glossary',
        'Credits',
        '100.1. Synthetic rule.',
      ].join('\n'),
    );
    expect(parsed.rules.get('100.1')?.text).toBe('Synthetic rule.');
    expect(kinds(parsed).filter((k) => k === 'unparsed-line')).toHaveLength(2);
  });

  test('a document without a Contents list still parses', () => {
    const parsed = parseCr(
      [
        'Synthetic Title',
        '',
        '1. One',
        '',
        '100. General',
        '',
        '100.1. Synthetic rule.',
        '',
        'Glossary',
        '',
        'Thing',
        'Defined.',
      ].join('\n'),
    );
    expect(parsed.rules.get('100.1')?.parent).toBe('100');
    expect(parsed.glossary.map((g) => g.term)).toEqual(['Thing']);
    expect(parsed.contentsTitles.size).toBe(0);
  });

  test('sub-rule letters up to two characters and an optional period are accepted', () => {
    const parsed = parseCr(
      miniDoc([
        '100.1. Rule.',
        '',
        '100.1z Last letter.',
        '',
        '100.1aa Double letter.',
        '',
        '100.1b. Period.',
      ]),
    );
    expect(parsed.rules.get('100.1z')?.text).toBe('Last letter.');
    expect(parsed.rules.get('100.1aa')?.text).toBe('Double letter.');
    expect(parsed.rules.get('100.1b')?.text).toBe('Period.');
    expect(parsed.rules.get('100.1')?.children).toEqual(['100.1z', '100.1aa', '100.1b']);
  });
});

describe('robustness', () => {
  const nasty = [
    '',
    '\n',
    '\r\n\r\n',
    '﻿',
    'Contents',
    'Glossary\nCredits\nGlossary',
    '1.',
    '100.',
    '100.1.',
    '100.1a',
    '999.999zz text',
    'Example:',
    'x'.repeat(200_000),
    '\u0000\u0001\u0002 control characters',
    '100.1. '.repeat(5000),
    `${'These rules are effective as of '.repeat(2000)}`,
  ];

  test.each(nasty.map((input, i) => [i, input] as const))('input %i never throws', (_, input) => {
    expect(() => parseCr(input)).not.toThrow();
    const parsed = parseCr(input);
    expect(parsed.stats.diagnosticCount).toBe(parsed.diagnostics.length);
  });

  test('random mixtures of line shapes never throw and always yield a consistent hierarchy', () => {
    const fragments = [
      '',
      'Contents',
      'Glossary',
      'Credits',
      '1. Section',
      '2. Another',
      '100. Heading',
      '100.1. Rule text.',
      '100.1a Sub-rule text.',
      '100.1b Sub-rule text.',
      '100.2. Rule.',
      '200.1. Other rule.',
      '200.1c Orphaned sub-rule.',
      'Example: something',
      'plain words',
      'Term',
      'These rules are effective as of June 1, 2099.',
      '“quoted”',
    ];
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let doc = 0; doc < 200; doc++) {
      const lines: string[] = [];
      const length = next() % 60;
      for (let i = 0; i < length; i++) lines.push(fragments[next() % fragments.length] ?? '');
      const parsed = parseCr(lines.join(doc % 2 === 0 ? '\n' : '\r\n'));
      for (const rule of parsed.rules.values()) {
        if (rule.parent !== null) {
          const parent = must(parsed.rules.get(rule.parent), `parent of ${rule.number}`);
          expect(parent.children).toContain(rule.number);
        }
        for (const child of rule.children)
          expect(parsed.rules.get(child)?.parent).toBe(rule.number);
      }
      searchRules(parsed, 'rule');
      getRule(parsed, '100.1');
    }
  });

  test('a document with thousands of rules parses and searches quickly enough to be interactive', () => {
    const body: string[] = [];
    for (let i = 1; i <= 3000; i++) {
      body.push(
        `100.${i}. Synthetic rule number ${i} about widgets.`,
        '',
        `100.${i}a Synthetic sub-rule.`,
        '',
      );
    }
    const started = performance.now();
    const parsed = parseCr(miniDoc(body));
    const hits = searchRules(parsed, 'widgets', { limit: 5 });
    expect(parsed.stats.ruleCount).toBe(3000);
    expect(parsed.stats.subruleCount).toBe(3000);
    expect(hits).toHaveLength(5);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

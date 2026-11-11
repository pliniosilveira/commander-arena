// Tests for link discovery. The HTML below is SYNTHETIC: invented markup, host names and file
// names (example.invalid is a reserved name). It is NOT the real Wizards page, whose layout could
// not be inspected, so these tests only prove the heuristics behave as documented.

import { describe, expect, test } from 'vitest';
import { chooseCandidate, extractCandidates, fileNameOfUrl } from './fetch-discover.ts';

const PAGE = 'https://rules.example.invalid/en/rules';

describe('extractCandidates', () => {
  test('collects txt, pdf, doc and docx links, resolving relative URLs and decoding entities', () => {
    const html = `
      <a href="https://files.example.invalid/dl/SynthCompRules%2020990101.txt">TXT</a>
      <a href='/dl/SynthCompRules 20990101.pdf'>PDF</a>
      <a href="/dl/Notes.docx?x=1&amp;y=2#top">Word</a>
      <a href="/dl/old.doc">Old</a>
      <a href="/en/other-page">Not a document</a>
      <a href="mailto:someone@example.invalid">mail</a>
    `;
    const found = extractCandidates(html, PAGE);
    expect(found.map((c) => [c.format, c.url])).toEqual([
      ['txt', 'https://files.example.invalid/dl/SynthCompRules%2020990101.txt'],
      ['pdf', 'https://rules.example.invalid/dl/SynthCompRules%2020990101.pdf'],
      ['docx', 'https://rules.example.invalid/dl/Notes.docx?x=1&y=2'],
      ['doc', 'https://rules.example.invalid/dl/old.doc'],
    ]);
    expect(found[0]?.fileName).toBe('SynthCompRules 20990101.txt');
    expect(found[0]?.linkText).toBe('TXT');
  });

  test('finds links that are only present inside JSON or data attributes', () => {
    const html = `<div data-file="https:\\/\\/files.example.invalid\\/dl\\/CompRules.txt"></div>
      <script>{"url":"https://files.example.invalid/dl/CompRules.txt","other":"/dl/x.pdf"}</script>`;
    const found = extractCandidates(html, PAGE);
    expect(found.map((c) => c.url)).toEqual([
      'https://files.example.invalid/dl/CompRules.txt',
      'https://rules.example.invalid/dl/x.pdf',
    ]);
  });

  test('deduplicates by URL and keeps the anchor text', () => {
    const html = `<script>"https://files.example.invalid/a.txt"</script>
      <a href="https://files.example.invalid/a.txt"><span>Download</span> <b>TXT</b></a>`;
    const found = extractCandidates(html, PAGE);
    expect(found).toHaveLength(1);
    expect(found[0]?.linkText).toBe('Download TXT');
  });

  test('returns an empty list for a page with no document links, and never throws on junk', () => {
    expect(extractCandidates('<html><body>Nothing here</body></html>', PAGE)).toEqual([]);
    expect(extractCandidates('', PAGE)).toEqual([]);
    expect(() => extractCandidates('<a href="http://[bad.txt">x</a>', PAGE)).not.toThrow();
  });

  test('scores plain text files that look like the Comprehensive Rules above anything else', () => {
    const html = `
      <a href="https://media.example.invalid/CompRules 20990101.txt">Comprehensive Rules (TXT)</a>
      <a href="https://media.example.invalid/CompRules 20990101.pdf">Comprehensive Rules (PDF)</a>
      <a href="https://media.example.invalid/UpdateBulletin.txt">Bulletin</a>
    `;
    const [txt, pdf, other] = extractCandidates(html, PAGE);
    expect(txt?.score).toBeGreaterThanOrEqual(100);
    expect(pdf?.score).toBeLessThan(0);
    expect(pdf?.reasons[0]).toContain('not plain text');
    expect(other?.score).toBeLessThan(50);
  });

  test('fileNameOfUrl decodes percent escapes and survives bad input', () => {
    expect(fileNameOfUrl('https://x.example.invalid/a/My%20File.txt?v=1')).toBe('My File.txt');
    expect(fileNameOfUrl('not a url')).toBe('');
    expect(fileNameOfUrl('https://x.example.invalid/%E0%A4%A.txt')).toContain('.txt');
  });
});

describe('chooseCandidate', () => {
  const choose = (html: string) => chooseCandidate(extractCandidates(html, PAGE));

  test('chooses the only plain text Comprehensive Rules link', () => {
    const choice = choose(`
      <a href="https://media.example.invalid/CompRules%2020990101.txt">TXT</a>
      <a href="https://media.example.invalid/CompRules%2020990101.pdf">PDF</a>`);
    expect(choice).toMatchObject({ kind: 'chosen', why: 'only plain text candidate' });
    if (choice.kind === 'chosen') expect(choice.candidate.fileName).toBe('CompRules 20990101.txt');
  });

  test('never chooses a pdf or a docx', () => {
    expect(choose('<a href="/CompRules.pdf">PDF</a><a href="/CompRules.docx">DOCX</a>')).toEqual({
      kind: 'none',
    });
  });

  test('refuses a text file with no sign that it is the Comprehensive Rules', () => {
    expect(choose('<a href="/dl/notes.txt">Notes</a>')).toEqual({ kind: 'none' });
  });

  test('prefers the later date when equally scored files differ only by date', () => {
    const choice = choose(`
      <a href="https://media.example.invalid/CompRules 20980101.txt">TXT</a>
      <a href="https://media.example.invalid/CompRules 20990101.txt">TXT</a>`);
    expect(choice).toMatchObject({ kind: 'chosen', why: 'equal score, later date in file name' });
    if (choice.kind === 'chosen') expect(choice.candidate.fileName).toContain('20990101');
  });

  test('prefers the higher score over a later date', () => {
    const choice = choose(`
      <a href="https://other.example.invalid/CompRules 20980101.txt">Comprehensive Rules</a>
      <a href="https://other.example.invalid/CompRules 20990101.txt">TXT</a>`);
    expect(choice).toMatchObject({ kind: 'chosen', why: 'highest score' });
    if (choice.kind === 'chosen') expect(choice.candidate.fileName).toContain('20980101');
  });

  test('reports ambiguity when nothing separates two links, and lists them', () => {
    const choice = choose(`
      <a href="https://media.example.invalid/CompRulesA.txt">TXT</a>
      <a href="https://media.example.invalid/CompRulesB.txt">TXT</a>`);
    expect(choice.kind).toBe('ambiguous');
    if (choice.kind === 'ambiguous') expect(choice.candidates).toHaveLength(2);
  });

  test('a companion document scores below the threshold', () => {
    expect(choose('<a href="https://media.example.invalid/CompRules-Changes.txt">TXT</a>')).toEqual(
      {
        kind: 'none',
      },
    );
  });
});

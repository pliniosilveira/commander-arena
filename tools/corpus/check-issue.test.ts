// `pnpm corpus:check-issue` with SYNTHETIC cards only: nothing here is real card data. The description is built the way the web app builds
// it (decklist, template report, names, card data block, build line), then broken one way at a time.

import { gzipSync } from 'node:zlib';
import { cardDataBlock, cardDataText, type GoldenCard } from '@commander-arena/cards';
import { describe, expect, test } from 'vitest';
import { checkIssue, main } from './check-issue.ts';

const card = (name: string, oracleId: string): GoldenCard => ({
  oracleId,
  name,
  layout: 'normal',
  colorIdentity: ['U'],
  edhrecRank: 2048,
  faces: [
    {
      name,
      manaCost: '{2}{U}',
      typeLine: 'Artifact Creature — Thopter',
      oracleText: 'Flying',
      power: '1',
      toughness: '1',
      loyalty: null,
      defense: null,
      colors: ['U'],
    },
  ],
  source: 'app import (Scryfall API)',
  acceptance: true,
});

const ONE = card('SYNTHETIC Issue Thopter', '33333333-0000-0000-0000-000000000001');
const TWO = card('SYNTHETIC Issue Engine', '33333333-0000-0000-0000-000000000002');

interface Parts {
  readonly records?: readonly GoldenCard[];
  readonly names?: readonly string[];
  readonly omit?: readonly string[];
  readonly extra?: readonly string[];
  readonly count?: number;
}

/** A description as the button writes it; `omit` drops the lines that start with one of the given words. */
function description(parts: Parts = {}): string {
  const records = parts.records ?? [ONE, TWO];
  const names = parts.names ?? records.map((r) => r.name);
  const payload = gzipSync(cardDataText(records)).toString('base64url');
  const text = [
    'The full report was copied to your clipboard when you pressed the button: paste it here, then submit.',
    '',
    'Commander',
    '1x SYNTHETIC Leader',
    '',
    'Mainboard',
    '2x SYNTHETIC Bear',
    ...names.map((n) => `1x ${n}`),
    '',
    '---',
    '',
    `Template report for "SYNTHETIC Deck": ${names.length} unsupported card(s).`,
    '',
    `Unsupported cards (${names.length}): ${names.join('; ')}`,
    '',
    cardDataBlock(payload, parts.count ?? records.length),
    '',
    ...(parts.extra ?? []),
    'Build abc1234 (2026-11-10) · Engine 73 · Card parser 77',
  ].join('\n');
  const omit = parts.omit ?? [];
  return text
    .split('\n')
    .filter((line) => !omit.some((word) => line.startsWith(word)))
    .join('\n');
}

describe('a complete request', () => {
  test('passes, and reports the commander and the unsupported names', () => {
    const result = checkIssue(description());
    expect(result).toEqual({
      complete: true,
      problems: [],
      commander: 'SYNTHETIC Leader',
      unsupported: ['SYNTHETIC Issue Thopter', 'SYNTHETIC Issue Engine'],
    });
  });

  test('Windows line endings, as a browser may send them, make no difference', () => {
    expect(checkIssue(description().replace(/\n/g, '\r\n')).complete).toBe(true);
  });
});

describe('an incomplete request says what is missing', () => {
  test('the short body the button writes when the report is too long for a link', () => {
    const short =
      'The full report (the decklist, what blocks it, the card data and the build) was copied to your clipboard when you pressed the button: paste it here, then submit.';
    const result = checkIssue(short);
    expect(result.complete).toBe(false);
    expect(result.problems.length).toBeGreaterThanOrEqual(5);
    expect(result.problems.join(' ')).toContain('Commander');
    expect(result.problems.join(' ')).toContain('card data');
  });

  test.each([
    ['the Commander section', { omit: ['Commander', '1x SYNTHETIC Leader'] }, 'Commander'],
    ['the Mainboard section', { omit: ['Mainboard', '2x SYNTHETIC Bear'] }, 'Mainboard'],
    ['the template report', { omit: ['Template report'] }, 'template report'],
    ['the unsupported names line', { omit: ['Unsupported cards ('] }, 'Unsupported cards'],
    ['the build line', { omit: ['Build '] }, 'build line'],
  ] as const)('without %s', (_what, parts, word) => {
    const result = checkIssue(description(parts));
    expect(result.complete).toBe(false);
    expect(result.problems.join(' ')).toContain(word);
  });

  test('names the lookup could not find', () => {
    const result = checkIssue(description({ extra: ['Names not found: Lost Card; Other', ''] }));
    expect(result.complete).toBe(false);
    expect(result.problems).toEqual([
      'these names were not found when the deck was imported: Lost Card; Other',
    ]);
  });

  test("cards left out to fit GitHub's limit", () => {
    const result = checkIssue(
      description({
        extra: ["2 more card(s) are left out, to keep the issue within GitHub's size limit: A; B"],
      }),
    );
    expect(result.complete).toBe(false);
    expect(result.problems.join(' ')).toContain('left out');
  });

  test('card data that is missing, damaged, or disagrees with the names', () => {
    const none = checkIssue(description().replace(/<details>[\s\S]*<\/details>/, ''));
    expect(none.problems.join(' ')).toContain('no "Card data for the golden corpus" block');

    const damaged = checkIssue(description().replace(/```text\n(.{10})/, '```text\nAAAAAAAAAA'));
    expect(damaged.complete).toBe(false);
    expect(damaged.problems.join(' ')).toContain('cannot be read');

    const wrongCount = checkIssue(description({ count: 5 }));
    expect(wrongCount.problems).toEqual(['the card data says 5 card(s) but holds 2']);

    const noRecord = checkIssue(description({ records: [ONE], names: [ONE.name, TWO.name] }));
    expect(noRecord.problems).toEqual([`the card data has no record for: ${TWO.name}`]);
  });
});

describe('a meld card (D-280, CR 712.5)', () => {
  const half: GoldenCard = {
    ...card('SYNTHETIC Issue Squire', '33333333-0000-0000-0000-000000000003'),
    layout: 'meld',
    relatedParts: [
      { name: 'SYNTHETIC Issue Squire', component: 'meld_part' },
      { name: 'SYNTHETIC Issue Titan', component: 'meld_result' },
    ],
  };
  const titan: GoldenCard = {
    ...card('SYNTHETIC Issue Titan', '33333333-0000-0000-0000-000000000004'),
    related: true,
  };
  const { acceptance: _no, ...titanRecord } = titan;

  test('is complete with the record of its melded face, which is no card of the deck', () => {
    const result = checkIssue(
      description({ records: [half, titanRecord as GoldenCard], names: [half.name] }),
    );
    expect(result.problems).toEqual([]);
    expect(result.complete).toBe(true);
  });

  test('is incomplete without it: the work would have nothing to read for the third card', () => {
    const result = checkIssue(description({ records: [half], names: [half.name] }));
    expect(result.complete).toBe(false);
    expect(result.problems).toEqual([
      'the card data has no record of the melded face: SYNTHETIC Issue Titan (the melded face of SYNTHETIC Issue Squire)',
    ]);
  });
});

describe('the command line', () => {
  test('needs --body', async () => {
    const out: string[] = [];
    expect(await main([], (t) => out.push(t))).toBe(2);
    expect(out[0]).toContain('usage');
  });
});

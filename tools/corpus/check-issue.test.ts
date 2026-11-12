// `pnpm corpus:check-issue` with SYNTHETIC cards only: nothing here is real card data. The description is built the way the web app builds
// it (decklist, template report, names, card data block, build line), then broken one way at a time.

import { gzipSync } from 'node:zlib';
import { cardDataBlock, cardDataText, type GoldenCard } from '@commander-arena/cards';
import { describe, expect, test } from 'vitest';
import { checkIssue, main, quoteName } from './check-issue.ts';

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
  /** Write the `cards:` lines of a template report under the report heading, as the button does. */
  readonly templateCards?: boolean;
  /** Leave the card data block out of the description. */
  readonly noBlock?: boolean;
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
    ...(parts.templateCards === true
      ? [
          '',
          'Ability templates the parser could not read (cards blocked, abilities, template, example):',
          `- ${names.length} card(s), ${names.length} ability(ies): SYNTHETIC ability`,
          '    e.g. SYNTHETIC ability',
          `    cards: ${names.join('; ')}`,
        ]
      : []),
    '',
    `Unsupported cards (${names.length}): ${names.join('; ')}`,
    '',
    ...(parts.noBlock === true ? [] : [cardDataBlock(payload, parts.count ?? records.length)]),
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
      notes: [],
      needsCardData: false,
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
    expect(result.needsCardData).toBe(false);
    expect(result.problems.join(' ')).toContain('no unsupported card name can be read');
  });

  test('without any name: neither the names line nor the cards of a template report', () => {
    const result = checkIssue(description({ omit: ['Unsupported cards ('] }));
    expect(result.complete).toBe(false);
    expect(result.needsCardData).toBe(false);
    expect(result.problems.join(' ')).toContain('no unsupported card name can be read');
  });

  test('names the lookup could not find', () => {
    const result = checkIssue(description({ extra: ['Names not found: Lost Card; Other', ''] }));
    expect(result.complete).toBe(false);
    expect(result.problems).toEqual([
      'these names were not found when the deck was imported: `Lost Card`; `Other`',
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
    expect(noRecord.problems).toEqual([`the card data has no record for: \`${TWO.name}\``]);
  });
});

describe('what the button writes besides the names and the card data is a note (D-290)', () => {
  test.each([
    ['the Commander section', { omit: ['Commander', '1x SYNTHETIC Leader'] }, 'Commander'],
    ['the Mainboard section', { omit: ['Mainboard', '2x SYNTHETIC Bear'] }, 'Mainboard'],
    ['the template report', { omit: ['Template report'] }, 'template report'],
    ['the build line', { omit: ['Build '] }, 'build line'],
  ] as const)('without %s the request is complete and says so', (_what, parts, word) => {
    const result = checkIssue(description(parts));
    expect(result.complete).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.notes.join(' ')).toContain(word);
  });

  test('the names come from the cards of the template report when the names line is missing', () => {
    const result = checkIssue(description({ omit: ['Unsupported cards ('], templateCards: true }));
    expect(result.complete).toBe(true);
    expect(result.unsupported).toEqual([ONE.name, TWO.name]);
    expect(result.notes.join(' ')).toContain('Unsupported cards');
  });
});

describe('the card data the workflow fetches (D-290)', () => {
  const noData = (parts: Parts = {}) =>
    description({ templateCards: true, omit: ['Unsupported cards ('], noBlock: true, ...parts });
  /** The workflow's comment: the block of the records, nothing else needed to be read. */
  const comment = (records: readonly GoldenCard[], count = records.length) =>
    [
      '<!-- deck-support-card-data -->',
      cardDataBlock(gzipSync(cardDataText(records)).toString('base64url'), count),
    ].join('\n');

  test('names that can be read and no card data: the workflow is asked to fetch it', () => {
    const result = checkIssue(noData());
    expect(result.complete).toBe(false);
    expect(result.needsCardData).toBe(true);
    expect(result.unsupported).toEqual([ONE.name, TWO.name]);
    expect(result.problems).toEqual([
      'the description has no "Card data for the golden corpus" block',
    ]);
  });

  test('a damaged block of the description is fetched again too', () => {
    const damaged = description().replace(/```text\n(.{10})/, '```text\nAAAAAAAAAA');
    const result = checkIssue(damaged);
    expect(result.complete).toBe(false);
    expect(result.needsCardData).toBe(true);
  });

  test('the comment completes the request, and the description needs no block', () => {
    const result = checkIssue(noData(), { cardData: comment([ONE, TWO]) });
    expect(result).toMatchObject({ complete: true, problems: [], needsCardData: false });
  });

  test('the comment is checked like a block: a count that lies, a missing record', () => {
    expect(checkIssue(noData(), { cardData: comment([ONE, TWO], 5) }).problems).toEqual([
      'the card data says 5 card(s) but holds 2',
    ]);
    const missing = checkIssue(noData(), { cardData: comment([ONE]) });
    expect(missing.complete).toBe(false);
    expect(missing.problems).toEqual([`the card data has no record for: \`${TWO.name}\``]);
    expect(missing.needsCardData).toBe(false);
    const empty = checkIssue(noData(), { cardData: 'a comment without a block' });
    expect(empty.problems).toEqual([
      'the card data comment has no "Card data for the golden corpus" block',
    ]);
  });

  test("the comment wins over a block of the description: the description is the author's, the comment is Scryfall's", () => {
    const forged = card(ONE.name, '33333333-0000-0000-0000-00000000dead');
    const result = checkIssue(description({ records: [forged, TWO] }), {
      cardData: comment([ONE, TWO]),
    });
    expect(result.complete).toBe(true);
  });

  test('other problems keep the workflow from fetching', () => {
    const lost = checkIssue(noData({ extra: ['Names not found: Lost Card', ''] }));
    expect(lost.complete).toBe(false);
    expect(lost.needsCardData).toBe(false);
  });

  test('names that cannot be sent to Scryfall: too many, too long, control characters', () => {
    const many = Array.from({ length: 101 }, (_, i) => `SYNTHETIC Card ${i}`);
    expect(checkIssue(noData({ names: many, records: [ONE] })).needsCardData).toBe(false);
    expect(
      checkIssue(noData({ names: ['x'.repeat(201)], records: [ONE] })).problems.join(' '),
    ).toContain('cannot be looked up');
    expect(
      checkIssue(noData({ names: ['Bad\u0007Name'], records: [ONE] })).problems.join(' '),
    ).toContain('cannot be looked up');
  });
});

describe('a name of the author is shown only in a code span (D-290)', () => {
  test('no mention, link, heading or line break gets through, and a long name is cut', () => {
    expect(quoteName('SYNTHETIC Name')).toBe('`SYNTHETIC Name`');
    expect(quoteName('@everyone `x` [a](https://example.invalid)')).toBe(
      "`@everyone 'x' [a](https://example.invalid)`",
    );
    expect(quoteName('line one\n# heading')).toBe('`line one # heading`');
    expect(quoteName('x'.repeat(200))).toBe(`\`${'x'.repeat(80)}…\``);
  });

  test('the problems that echo names use it', () => {
    const result = checkIssue(description({ extra: ['Names not found: @someone; `a`', ''] }));
    expect(result.problems).toEqual([
      "these names were not found when the deck was imported: `@someone`; `'a'`",
    ]);
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

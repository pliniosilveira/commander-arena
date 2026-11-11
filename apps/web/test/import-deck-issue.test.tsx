/**
 * Asking for a deck's support with one click (the import results, D-244, D-245): the issue is built from the report, carries the card
 * data compressed, the link carries it when it fits, and a report too long for a link goes to the clipboard.
 */
import { cardDataPayload, parseCardDataText } from '@commander-arena/cards';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { computeCoverage } from '../src/import/coverage';
import {
  cardSection,
  deckIssue,
  deckIssueBody,
  decklistText,
  gzipBase64url,
  ISSUES_NEW_URL,
  MAX_ISSUE_BODY_LENGTH,
  MAX_ISSUE_URL_LENGTH,
} from '../src/import/deck-issue';
import { MemoryDeckStore } from '../src/import/stores';
import type { ImportEnvironment, ImportReport } from '../src/import/types';
import { ImportProvider } from '../src/ui/import/import-context';
import { type ResultsActions, ResultsView } from '../src/ui/import/ResultsView';
import type { VersionInfo } from '../src/version';
import {
  BEAR,
  BOTH_GAPS,
  COMMANDER,
  ENGINE_GAP,
  entry,
  playableReport,
  SEER,
} from './import-ui-fixtures';

const VERSION: VersionInfo = { commit: 'abc1234', date: '2026-11-10', engine: 73, parser: 77 };

const withUnsupported = (name = 'SYNTHETIC Deck'): ImportReport => {
  const entries = [
    entry(COMMANDER, 1, 'commander'),
    entry(BEAR, 2),
    entry(SEER),
    entry(ENGINE_GAP),
    entry(BOTH_GAPS),
  ];
  return playableReport({ deckName: name, entries, coverage: computeCoverage(entries) });
};

const queryOf = (url: string, key: string): string => new URL(url).searchParams.get(key) ?? '';

/** What `pnpm corpus:from-issue` does with the block, here with the platform's own decompression. */
async function decode(body: string) {
  const payload = cardDataPayload(body);
  if (payload === null) return null;
  const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return parseCardDataText(await new Response(stream).text());
}

/** A distinct unsupported card with a long Oracle text that does not compress away, to fill a body. */
const wall = (i: number, length = 2000) => {
  const face = BOTH_GAPS.stored.faces[0] as (typeof BOTH_GAPS.stored.faces)[number];
  // A seeded linear congruential generator: letters with no pattern for gzip to find.
  let x = 1 + i;
  const text = Array.from({ length }, () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return String.fromCharCode(97 + ((x >>> 16) % 26));
  });
  return {
    ...BOTH_GAPS,
    stored: {
      ...BOTH_GAPS.stored,
      oracleId: `synthetic-wall-of-text-${i}`,
      name: `SYNTHETIC Wall Of Text ${i}`,
      faces: [{ ...face, oracleText: text.join('') }],
    },
  };
};

describe('the issue for an unsupported deck', () => {
  test('the decklist is a Commander section and a Mainboard with counts, as the owner pastes it', () => {
    expect(decklistText(withUnsupported())).toBe(
      [
        'Commander',
        `1x ${COMMANDER.stored.name}`,
        '',
        'Mainboard',
        `2x ${BEAR.stored.name}`,
        `1x ${SEER.stored.name}`,
        `1x ${ENGINE_GAP.stored.name}`,
        `1x ${BOTH_GAPS.stored.name}`,
      ].join('\n'),
    );
  });

  test('the body: decklist, rule, template report, names, cards, card data, build', async () => {
    const body = await deckIssueBody(withUnsupported(), VERSION);
    const at = (text: string) => body.indexOf(text);
    expect(at('Commander\n')).toBe(0);
    expect(at('\n\n---\n\n')).toBeGreaterThan(at('Mainboard'));
    expect(at('Template report for "SYNTHETIC Deck": 3 unsupported card(s).')).toBeGreaterThan(
      at('---'),
    );
    const line = body.split('\n').find((l) => l.startsWith('Unsupported cards (3): ')) ?? '';
    expect(line.slice('Unsupported cards (3): '.length).split('; ').sort()).toEqual(
      [SEER, ENGINE_GAP, BOTH_GAPS].map((c) => c.stored.name).sort(),
    );
    const cards = at('Unsupported cards, and why each is blocked:');
    expect(cards).toBeGreaterThan(at('Unsupported cards (3)'));
    expect(at('Card data for the golden corpus (3 card(s), gzip+base64url)')).toBeGreaterThan(
      cards,
    );
    expect(body.endsWith('Build abc1234 (2026-11-10) · Engine 73 · Card parser 77')).toBe(true);
  });

  test('each unsupported card shows its cost, type line and why it is blocked; supported cards do not', async () => {
    const body = await deckIssueBody(withUnsupported(), VERSION);
    for (const card of [SEER, ENGINE_GAP, BOTH_GAPS]) {
      const face = card.stored.faces[0];
      expect(body).toContain(`### ${card.stored.name}\n${face?.manaCost}  ${face?.typeLine}`);
    }
    expect(body).not.toContain(`### ${BEAR.stored.name}`);
    expect(cardSection(ENGINE_GAP)).toContain('- engine: cannot run it yet; missing ');
    expect(cardSection(BOTH_GAPS)).toContain('- grammar: stopped at "');
    expect(cardSection(BOTH_GAPS)).toContain('- engine: cannot run it yet');
  });

  test('the card data decodes to the records of the unsupported cards, with their whole Oracle text', async () => {
    const records = (await decode(await deckIssueBody(withUnsupported(), VERSION))) ?? [];
    expect(records.map((r) => r.name).sort()).toEqual(
      [SEER, ENGINE_GAP, BOTH_GAPS].map((c) => c.stored.name).sort(),
    );
    for (const card of [SEER, ENGINE_GAP, BOTH_GAPS]) {
      const record = records.find((r) => r.name === card.stored.name);
      expect(record).toMatchObject({
        oracleId: card.stored.oracleId,
        layout: card.stored.layout,
        source: 'app import (Scryfall API)',
        acceptance: true,
      });
      expect(record?.faces[0]?.oracleText).toBe(card.stored.faces[0]?.oracleText);
    }
  });

  test('compression makes repetitive card data much smaller than its text', async () => {
    const text = Array.from({ length: 12 }, (_, i) =>
      JSON.stringify(SEER.stored).replace('Seer', `Seer ${i}`),
    ).join('\n');
    expect((await gzipBase64url(text)).length * 3).toBeLessThan(text.length);
  });

  test('a card with two faces shows both cost and type lines', () => {
    const face = SEER.stored.faces[0] as (typeof SEER.stored.faces)[number];
    const back = { ...face, name: 'SYNTHETIC Back', manaCost: '', typeLine: 'Land' };
    const twoFaced = { ...SEER, stored: { ...SEER.stored, faces: [face, back] } };
    expect(cardSection(twoFaced)).toContain(`${face.manaCost}  ${face.typeLine} // Land`);
  });

  test("the body never passes GitHub's size limit: cards that do not fit are named, the rest decodes", async () => {
    const entries = Array.from({ length: 80 }, (_, i) => entry(wall(i)));
    const report = playableReport({ entries, coverage: computeCoverage(entries) });
    const body = await deckIssueBody(report, VERSION);
    expect(body.length).toBeLessThanOrEqual(MAX_ISSUE_BODY_LENGTH);
    expect(MAX_ISSUE_BODY_LENGTH).toBeLessThan(65536);
    expect(body).toMatch(
      /\d+ more card\(s\) are left out, to keep the issue within GitHub's size limit: SYNTHETIC Wall Of Text \d+/,
    );
    expect(body).not.toContain('### SYNTHETIC Wall Of Text 79');
    const records = (await decode(body)) ?? [];
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThan(80);
    expect(body).toContain(`### ${records[records.length - 1]?.name}\n`);
    expect(body.endsWith('Card parser 77')).toBe(true);
  });

  test('names the lookup could not find are listed, and a deck with none has no such line', async () => {
    const report = withUnsupported();
    expect(await deckIssueBody(report, VERSION)).not.toContain('Names not found');
    const lost = await deckIssueBody(
      { ...report, notFound: [{ name: 'Lost Card', count: 1, line: 4, reason: 'not-found' }] },
      VERSION,
    );
    expect(lost).toContain('Names not found: Lost Card');
  });

  test('the title is "deck support" and the deck name, as the owner titles them', async () => {
    expect((await deckIssue(withUnsupported('hofri'), VERSION)).title).toBe('deck support hofri');
    expect((await deckIssue(withUnsupported('  '), VERSION)).title).toBe('deck support');
  });

  test('a report that fits goes in the link whole: GitHub opens the issue with title and body filled in', async () => {
    const issue = await deckIssue(withUnsupported('hofri'), VERSION);
    expect(issue.fitsInLink).toBe(true);
    expect(issue.url.startsWith(`${ISSUES_NEW_URL}?`)).toBe(true);
    expect(issue.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    expect(queryOf(issue.url, 'title')).toBe('deck support hofri');
    expect(queryOf(issue.url, 'body')).toBe(issue.body);
  });

  test('a report too long for a link keeps the whole body for the clipboard and opens with a short one', async () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(wall(i, 600)));
    const report = playableReport({ entries, coverage: computeCoverage(entries) });
    const issue = await deckIssue(report, VERSION);
    expect(issue.fitsInLink).toBe(false);
    expect(issue.url.length).toBeLessThan(MAX_ISSUE_URL_LENGTH);
    expect(queryOf(issue.url, 'title')).toBe('deck support SYNTHETIC Deck');
    expect(queryOf(issue.url, 'body')).toContain('copied to your clipboard');
    expect(issue.body).toContain('### SYNTHETIC Wall Of Text 29');
  });
});

const noActions: ResultsActions = {
  busy: false,
  rejectedFuzzy: [],
  onAccept: () => {},
  onReject: () => {},
  onChooseCommanders: () => {},
  onWhy: () => {},
};

const env = (): ImportEnvironment => ({
  service: {
    run: async () => {
      throw new Error('not used');
    },
  },
  decks: new MemoryDeckStore(() => 0),
});

const results = (report: ImportReport) =>
  renderToStaticMarkup(
    <ImportProvider environment={env()}>
      <ResultsView report={report} actions={noActions} />
    </ImportProvider>,
  );

describe('the button in the coverage report', () => {
  test('a deck with unsupported cards has it, outside the collapsed panel so it needs no opening', () => {
    const out = results(withUnsupported());
    expect(out).toContain('data-testid="report-issue"');
    expect(out).toContain('Ask for support on GitHub');
    expect(out.indexOf('data-testid="report-issue"')).toBeLessThan(
      out.indexOf('data-testid="template-panel"'),
    );
  });

  test('a fully supported deck has no button', () => {
    const entries = [entry(COMMANDER, 1, 'commander'), entry(BEAR, 2)];
    const out = results(playableReport({ entries, coverage: computeCoverage(entries) }));
    expect(out).not.toContain('report-issue');
  });
});

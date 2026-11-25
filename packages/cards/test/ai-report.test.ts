/**
 * The replay record of an AI report (issue 627): the format the web app writes and `tools/ai/report.ts` reads back. Compression is each
 * side's own, so here the payload is any base64url text. The records and the card are SYNTHETIC, not taken from a real game or Scryfall.
 */
import { describe, expect, test } from 'vitest';
import {
  AI_REPORT_COMMENT_MAX,
  AI_REPORT_FORMAT,
  AI_REPORT_SUMMARY,
  type AiReport,
  aiReportBlock,
  aiReportPayload,
  aiReportText,
  parseAiReportText,
  replayCard,
  reportComment,
  type SnapshotCard,
} from '../src/index';

const syntheticCard: SnapshotCard = {
  oracleId: 'synthetic-oracle-1',
  scryfallId: 'synthetic-print-1',
  name: 'Synthetic Bear',
  layout: 'normal',
  faces: [
    {
      name: 'Synthetic Bear',
      manaCost: '{1}{G}',
      typeLine: 'Creature — Bear',
      oracleText: '',
      power: '2',
      toughness: '2',
      loyalty: null,
      defense: null,
      colors: ['G'],
      imageUris: { normal: 'https://example.invalid/n.jpg', large: null, artCrop: null },
      artist: 'Nobody',
    },
  ],
  cmc: 2,
  colorIdentity: ['G'],
  keywords: [],
  producedMana: [],
  commanderLegality: 'legal',
  edhrecRank: null,
  gameChanger: null,
  relatedParts: [],
};

const record = (over: Partial<AiReport> = {}): AiReport => ({
  format: AI_REPORT_FORMAT,
  engine: 10,
  parser: 20,
  app: 'dev',
  seed: 5,
  seats: 2,
  freeMulligan: true,
  ai: 'normal',
  aiSeat: 1,
  decks: [
    { name: 'Mine', decklist: 'Commander\n1 Synthetic Bear', cards: [replayCard(syntheticCard)] },
    { name: 'test', hidden: 'swamp-forest' },
  ],
  emblems: [],
  actions: [
    { seat: 0, action: { kind: 'keepHand' } },
    { seat: 1, action: { kind: 'pass' } },
  ],
  reported: 1,
  comment: 'Cast the bear.',
  ...over,
});

describe('the record', () => {
  test('round-trips through its text', () => {
    expect(parseAiReportText(aiReportText(record()))).toEqual(record());
  });

  test('the carried card data has no images', () => {
    const card = replayCard(syntheticCard);
    expect(card.faces[0]?.imageUris).toBeNull();
    expect(card.faces[0]?.artist).toBeNull();
    expect(card.faces[0]?.oracleText).toBe('');
  });

  test('refuses another format, saying which', () => {
    const text = JSON.stringify({ ...record(), format: 2 });
    expect(() => parseAiReportText(text)).toThrow(/format 2; this tree reads format 1/);
    expect(() => parseAiReportText('{nope')).toThrow(/not JSON/);
  });

  test('refuses a record that does not hang together', () => {
    const bad = (over: Partial<AiReport>) => () => parseAiReportText(aiReportText(record(over)));
    expect(bad({ seats: 3 })).toThrow(/3 seats but carries 2 decks/);
    expect(bad({ aiSeat: 0 })).toThrow(/not an AI seat/);
    expect(bad({ reported: 0 })).toThrow(/not the last action/);
    expect(
      bad({
        actions: [
          { seat: 1, action: { kind: 'keepHand' } },
          { seat: 0, action: { kind: 'pass' } },
        ],
      }),
    ).toThrow(/not an action of the AI seat/);
    expect(bad({ decks: [{ name: 'x' }, { name: 'y', hidden: 'z' }] })).toThrow(/well-formed/);
    expect(bad({ comment: 'x'.repeat(AI_REPORT_COMMENT_MAX + 1) })).toThrow(/well-formed/);
    const extra = JSON.stringify({ ...record(), unknownField: 1 });
    expect(() => parseAiReportText(extra)).toThrow(/well-formed/);
  });
});

describe('the comment', () => {
  test('is one line, cut to the limit', () => {
    expect(reportComment('  Attack\n\nthe   player  ')).toBe('Attack the player');
    expect(reportComment('a'.repeat(500))).toHaveLength(AI_REPORT_COMMENT_MAX);
  });
});

describe('the block', () => {
  test('is collapsed, names the format, and gives back its payload', () => {
    const payload = 'A'.repeat(200);
    const block = aiReportBlock(payload, 2);
    expect(block).toContain(
      `<summary>${AI_REPORT_SUMMARY} (format 1, 2 actions, gzip+base64url)</summary>`,
    );
    expect(block.split('\n').every((line) => line.length <= 120)).toBe(true);
    expect(aiReportPayload(`Some words\n\n${block}\n\nmore`)).toBe(payload);
    expect(aiReportPayload(block.replace(/\n/g, '\r\n'))).toBe(payload);
  });

  test('is absent, open or damaged', () => {
    expect(aiReportPayload('no block here')).toBeNull();
    const block = aiReportBlock('abc', 1);
    expect(() => aiReportPayload(block.replace(/```\n\n<\/details>/, ''))).toThrow(/not closed/);
    expect(() => aiReportPayload(block.replace('abc', 'a$c'))).toThrow(/base64url/);
  });
});

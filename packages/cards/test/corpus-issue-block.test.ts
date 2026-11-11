/**
 * The card data block of a support issue (D-245): the format the web app writes and `pnpm corpus:from-issue` reads back. Compression is
 * each side's own (the browser's, Node's zlib), so here the payload is any base64url text. The cards are SYNTHETIC records, not real
 * Scryfall data.
 */
import { describe, expect, test } from 'vitest';
import {
  CARD_DATA_ENCODING,
  CARD_DATA_SUMMARY,
  cardDataBlock,
  cardDataPayload,
  cardDataText,
  type GoldenCard,
  ISSUE_CARD_SOURCE,
  parseCardDataText,
} from '../src/index';

const card = (name: string, oracleId: string): GoldenCard => ({
  oracleId,
  name,
  layout: 'normal',
  colorIdentity: ['U'],
  edhrecRank: 1234,
  faces: [
    {
      name,
      manaCost: '{1}{U}',
      typeLine: 'Artifact Creature — Thopter',
      oracleText: 'Flying\nWhen this creature enters, draw a card. "Quoted" text stays.',
      power: '1',
      toughness: '1',
      loyalty: null,
      defense: null,
      colors: ['U'],
    },
  ],
  source: ISSUE_CARD_SOURCE,
  acceptance: true,
});

const A = card('SYNTHETIC Thopter One', '00000000-0000-0000-0000-00000000000a');
const B = card('SYNTHETIC Thopter Two', '00000000-0000-0000-0000-00000000000b');

/** A payload long enough to wrap: base64url characters only. */
const PAYLOAD = `${'H4sIAAAAAAAAA-_abc'.repeat(12)}xyz`;

const issue = (block: string) =>
  [
    'Commander',
    '1x SYNTHETIC Leader',
    '',
    '---',
    '',
    'Template report ...',
    '',
    block,
    '',
    'Build x',
  ].join('\n');

describe('the card data of a support issue', () => {
  test('the text is one record per line, and reads back card for card', () => {
    const text = cardDataText([A, B]);
    expect(text.split('\n')).toHaveLength(2);
    expect(parseCardDataText(text)).toEqual([A, B]);
  });

  test('the block names the encoding and the count, wraps the payload, and gives it back whole', () => {
    const block = cardDataBlock(PAYLOAD, 2);
    expect(block).toContain(
      `<summary>${CARD_DATA_SUMMARY} (2 card(s), ${CARD_DATA_ENCODING})</summary>`,
    );
    expect(PAYLOAD.length).toBeGreaterThan(76);
    expect(
      block
        .split('\n')
        .filter((line) => /^[A-Za-z0-9_-]+$/.test(line))
        .every((l) => l.length <= 76),
    ).toBe(true);
    expect(cardDataPayload(issue(block))).toBe(PAYLOAD);
  });

  test('Windows line endings, as a browser may send them, give the same payload', () => {
    expect(cardDataPayload(issue(cardDataBlock(PAYLOAD, 1)).replace(/\n/g, '\r\n'))).toBe(PAYLOAD);
  });

  test('an issue without the block gives null', () => {
    expect(cardDataPayload('deck support\n\nno data here')).toBeNull();
  });

  test('an open block, or one with characters base64url does not use, stops the read', () => {
    const open = issue(cardDataBlock(PAYLOAD, 1)).replace(/```\n\n<\/details>/, '');
    expect(() => cardDataPayload(open)).toThrow(/not closed/);
    const edited = issue(cardDataBlock(PAYLOAD, 1)).replace('xyz', 'x y!');
    expect(() => cardDataPayload(edited)).toThrow(/base64url/);
  });

  test('a record that is not a card the app wrote stops the read, naming the line', () => {
    expect(() => parseCardDataText(cardDataText([A, { ...B, oracleId: null }]))).toThrow(
      /line 2 .*no oracle id/,
    );
    const noText = {
      ...A,
      faces: [{ ...(A.faces[0] as GoldenCard['faces'][number]), oracleText: 7 as never }],
    };
    expect(() => parseCardDataText(cardDataText([noText]))).toThrow(/line 1 .*text fields/);
    expect(() => parseCardDataText('{"name":')).toThrow(/not JSON/);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';

const cards = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === 'Lord of the Nazgûl');
if (card === undefined) throw new Error('Lord of the Nazgûl is not in the golden corpus');

describe('Lord of the Nazgûl', () => {
  test('loads the issue card from its hand-written engine fixture', () => {
    const imported = importCard(fromGoldenCard(card));
    expect(imported.support, JSON.stringify(imported.support)).toMatchObject({
      status: 'supported',
      source: 'fixture',
      unparsed: [],
    });
  });
});

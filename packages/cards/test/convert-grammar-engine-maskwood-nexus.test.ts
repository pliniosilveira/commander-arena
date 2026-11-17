import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';

const card = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
).find(({ name }) => name === 'Maskwood Nexus');
if (card === undefined) throw new Error('Maskwood Nexus is not in the golden corpus');

describe('Maskwood Nexus', () => {
  test('loads the issue card from its hand-written engine fixture', () => {
    const imported = importCard(fromGoldenCard(card));
    expect(imported.support, JSON.stringify(imported.support)).toMatchObject({
      status: 'supported',
      source: 'fixture',
      unparsed: [],
    });
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';

const card = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
).find(({ name }) => name === "Sauron's Ransom");
if (card === undefined) throw new Error("Sauron's Ransom is not in the golden corpus");

describe("Sauron's Ransom", () => {
  test('loads the issue card from its hand-written engine fixture', () => {
    const imported = importCard(fromGoldenCard(card));
    expect(imported.support, JSON.stringify(imported.support)).toMatchObject({
      status: 'supported',
      source: 'fixture',
      unparsed: [],
    });
  });
});

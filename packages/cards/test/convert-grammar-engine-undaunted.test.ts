// Undaunted (CR 702.125a): the REAL Oracle text of Curtains' Call (the corpus's golden.jsonl) goes through the grammar as a card with no override and reads as supported, with the
// keyword and the spell it already read. Near misses: a number after the keyword is not the keyword.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { read, readAll } from './parser-p5-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

describe('Undaunted', () => {
  test('the real card reads as supported and carries the keyword', () => {
    const card = GOLDEN.find((c) => c.name === "Curtains' Call");
    if (card === undefined) throw new Error("Curtains' Call is not in the golden corpus");
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'undaunted' },
    });
  });

  test('is a keyword with no parameter', () => {
    expect(readAll('Undaunted', 'sorcery').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'undaunted' } },
    ]);
  });

  test('an undaunted with a number is not read', () => {
    const parsed = read('Undaunted 2', 'sorcery');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

// Jump-start (CR 702.133a), issue 121 (the Quick Draw deck): the REAL Oracle text of Radical Idea (the corpus's golden.jsonl) goes through the grammar as a card with no override and
// reads as supported, and what the grammar writes is what the SYNTHETIC sibling of the engine fixture (`synthetic-jump-start.ts`) holds, which the engine scenario test plays
// (`scenario-xx-jump-start.test.ts`). Near misses: a jump-start with a cost is not the keyword.
import { readFileSync } from 'node:fs';
import { syntheticCard } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { read, readAll } from './parser-p5-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

describe('Jump-start', () => {
  test('the real card reads as supported and is the card of its SYNTHETIC sibling', () => {
    const card = GOLDEN.find((c) => c.name === 'Radical Idea');
    if (card === undefined) throw new Error('Radical Idea is not in the golden corpus');
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    const synthetic = syntheticCard('SYNTHETIC Jump Draw');
    expect(imported.definition.faces[0]?.abilities).toEqual(synthetic.faces[0]?.abilities);
    expect(imported.definition.faces[0]?.spell ?? null).toEqual(synthetic.faces[0]?.spell ?? null);
  });

  test('is a keyword with no parameter', () => {
    expect(readAll('Jump-start', 'instant').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'jumpStart' } },
    ]);
  });

  test('a jump-start with a cost is not read', () => {
    const parsed = read('Jump-start {1}{U}', 'instant');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

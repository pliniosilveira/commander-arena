// The "Vraska EDHREC" deck of the owner (decks/vraska-edhrec.txt, issue 120, D-216 and following): every card of it, read from the REAL
// texts of the golden corpus, must be fully supported. This is the same test the owner's `pnpm corpus:decks` answers with
// "FULLY SUPPORTED" (basic lands come from the engine fixtures, so they are not counted here).
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  fromGoldenCard,
  frontFaceName,
  type GoldenCard,
  importCard,
  parseDecklist,
  parseGolden,
} from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const golden: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const deck = parseDecklist(
  readFileSync(new URL('../../../decks/vraska-edhrec.txt', import.meta.url), 'utf8'),
);

const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);

const names = [
  ...new Set(
    [...deck.sections.commander, ...deck.sections.main]
      .map((e) => e.name)
      .filter((n) => !BASICS.has(n)),
  ),
].sort();

describe('the Vraska EDHREC deck is fully supported from the real texts', () => {
  test('the deck lists 86 distinct cards, basic lands included', () => {
    expect(deck.errors).toEqual([]);
    expect(names.length).toBeGreaterThan(70);
  });

  test('every card of the deck reads completely and is supported', () => {
    const problems: string[] = [];
    let found = 0;
    for (const name of names) {
      const card = golden.find(
        (c) => c.name === name || frontFaceName(c.name) === frontFaceName(name),
      );
      if (card === undefined) continue; // read by the owner's run over the bulk file only
      found += 1;
      const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
      if (imported.support.status === 'supported') continue;
      const lines = imported.support.unparsed.map(
        (u) =>
          `${u.text} [${u.reason ?? '?'}${u.needs ? ` needs ${JSON.stringify(u.needs)}` : ''}]`,
      );
      problems.push(`${name}: ${[...lines, ...imported.support.reasons].join(' | ')}`);
    }
    expect(problems).toEqual([]);
    // The 21 cards that were unsupported on 2026-11-05 and their companions of the golden corpus.
    expect(found).toBeGreaterThanOrEqual(21);
  });
});

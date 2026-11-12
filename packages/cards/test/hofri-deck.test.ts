// The "Hofri Ghostforge" deck of the owner (decks/hofri.txt, issue 128, D-229 and following): every card of it, read from the REAL
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
  readFileSync(new URL('../../../decks/hofri.txt', import.meta.url), 'utf8'),
);

const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);

/**
 * The cards of the deck the engine does not read yet: none, the deck is complete. The test insists that
 * exactly these fail, so a card that stops reading shows up here.
 */
const PENDING: ReadonlySet<string> = new Set<string>();

// NOTE (D-236): Turbulent Steppe is not in the golden corpus yet, so the measure below skips it (`found` counts only the cards the corpus holds).
// The text the owner pasted is covered by `convert-grammar-engine-p73.test.ts` until the owner's `pnpm corpus:extract` adds the real record to
// `golden.jsonl`; from then on this test measures it with the rest of the deck.

const names = [
  ...new Set(
    [...deck.sections.commander, ...deck.sections.main]
      .map((e) => e.name)
      .filter((n) => !BASICS.has(n)),
  ),
].sort();

describe('the Hofri Ghostforge deck is fully supported from the real texts', () => {
  test('the deck lists its distinct cards, basic lands excluded', () => {
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
      if (imported.support.status === 'supported') {
        if (PENDING.has(name)) problems.push(`${name}: supported now, remove it from PENDING`);
        continue;
      }
      if (PENDING.has(name)) continue;
      const lines = imported.support.unparsed.map(
        (u) =>
          `${u.text} [${u.reason ?? '?'}${u.needs ? ` needs ${JSON.stringify(u.needs)}` : ''}]`,
      );
      problems.push(`${name}: ${[...lines, ...imported.support.reasons].join(' | ')}`);
    }
    expect(problems).toEqual([]);
    // The 37 unsupported cards of the golden corpus on 2026-11-08 and their companions.
    expect(found).toBeGreaterThanOrEqual(37);
  });
});

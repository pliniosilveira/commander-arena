// The Prismari deck (issue 87), group 3 (D-660 and later): the REAL Oracle text of Abstract Performance, Creative Technique, Replication Technique, Dance with Calamity, Plargg and
// Nassari, Surge to Victory and Throes of Chaos (the corpus's golden.jsonl) goes through the grammar as a card with no override and reads as supported, and what the grammar writes is what
// the SYNTHETIC siblings of the engine fixtures (`synthetic-prismari-g3.ts`) hold, which the engine scenario tests and the AI soak play. Pins: CR 608.2g (spells cast during resolution),
// CR 700.3 (piles), CR 702.144a (Demonstrate), CR 702.81a (Retrace), CR 603.7 (the delayed ability of Surge to Victory), CR 303.4f (the Aura token of Replication Technique).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const PAIRS: readonly (readonly [string, string])[] = [
  ['Abstract Performance', 'SYNTHETIC Pile Performance'],
  ['Creative Technique', 'SYNTHETIC Reveal Technique'],
  ['Replication Technique', 'SYNTHETIC Copy Technique'],
  ['Dance with Calamity', 'SYNTHETIC Calamity Dance'],
  ['Plargg and Nassari', 'SYNTHETIC Chaos Orc'],
  ['Surge to Victory', 'SYNTHETIC Surge Victory'],
  ['Throes of Chaos', 'SYNTHETIC Chaos Retrace'],
];

describe('the real cards of group 3 are supported and are the cards of their SYNTHETIC siblings', () => {
  test.each(PAIRS)('%s', (name, sibling) => {
    const card = real(name);
    const synthetic = syntheticCard(sibling);
    expect(card.faces[0]?.abilities).toEqual(synthetic.faces[0]?.abilities);
    expect(card.faces[0]?.spell ?? null).toEqual(synthetic.faces[0]?.spell ?? null);
  });
});

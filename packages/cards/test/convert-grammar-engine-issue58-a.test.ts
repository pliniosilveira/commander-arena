import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const NAMES = [
  'Blight Mound',
  'Bloodghast',
  'Ohran Frostfang',
  'Feral Appetite',
  'Pest Rescuer',
  "Teacher's Pest",
  'Ribtruss Roaster',
];

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`Missing corpus card ${name}`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

describe('issue58 group A real imports', () => {
  test.each(NAMES)('%s reads entirely and validates', (name) => {
    expect(validateCard(real(name))).toEqual([]);
  });
});

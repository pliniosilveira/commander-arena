import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, `${name}: ${JSON.stringify(imported.support)}`).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

describe('effects that grant a death-triggered return until end of turn', () => {
  test('Feign Death is a supported effect sequence', () => {
    expect(real('Feign Death').faces[0]?.spell).toBeDefined();
  });

  test('Supernatural Stamina grants the same return trigger alongside its power bonus', () => {
    expect(real('Supernatural Stamina').faces[0]?.spell).toBeDefined();
  });
});

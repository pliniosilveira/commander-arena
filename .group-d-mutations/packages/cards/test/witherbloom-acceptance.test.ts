import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const NAMES = [
  'Blight Mound',
  'Bloodghast',
  'Blossoming Bogbeast',
  'Culling Ritual',
  'Deadly Brew',
  'Defiling Daemogoth',
  'Eccentric Pestfinder // Turn Stones',
  'Feral Appetite',
  'Final Act',
  'Gorma, the Gullet',
  'Gyome, Master Chef',
  'Immoral Bargain',
  'Mortality Spear',
  'Nether Traitor',
  'Ohran Frostfang',
  'Ominous Harvest',
  'Pest Infestation',
  'Pest Rescuer',
  'Ribtruss Roaster',
  'Stensian Sanguinist // Exsanguinate',
  "Teacher's Pest",
  'Witch of the Moors',
  'Witherbloom Charm',
  'Witherbloom Command',
] as const;
const corpus = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

describe('Witherbloom Pestilence: every unsupported card reported in issue #58', () => {
  test.each(NAMES)('%s is supported through the grammar, without fixture overrides', (name) => {
    const card = corpus.find((entry) => entry.name === name);
    expect(card, `${name}: missing acceptance data`).toBeDefined();
    if (card === undefined) return;
    expect(card.acceptance, name).toBe(true);
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.unparsed, name).toEqual([]);
    expect(imported.support.reasons, name).toEqual([]);
    expect(imported.support.status, name).toBe('supported');
    expect(validateCard(imported.definition), name).toEqual([]);
  });
});

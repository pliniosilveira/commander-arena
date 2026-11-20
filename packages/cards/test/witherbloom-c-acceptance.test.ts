import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const NAMES = ['Gaze of Granite'] as const;
const corpus = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

describe('Witherbloom Witchcraft group C: supported through the grammar, without fixture overrides', () => {
  test.each(NAMES)('%s', (name) => {
    const card = corpus.find((entry) => entry.name === name);
    expect(card, `${name}: missing acceptance data`).toBeDefined();
    if (card === undefined) return;
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.unparsed, name).toEqual([]);
    expect(imported.support.reasons, name).toEqual([]);
    expect(imported.support.status, name).toBe('supported');
    expect(validateCard(imported.definition), name).toEqual([]);
  });
});

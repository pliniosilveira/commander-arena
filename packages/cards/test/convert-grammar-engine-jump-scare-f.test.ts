// Jump Scare! deck (issue #108), group F: Overgrown Zealot and Primordial Mist. The real Oracle text is parsed whole from the golden corpus; the engine behavior of each
// restriction and cost is proven by the SYNTHETIC scenarios in the engine package.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const GOLDEN: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

describe('Overgrown Zealot', () => {
  test('is supported', () => {
    const imported = real('Overgrown Zealot');
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('its second mana ability makes two mana of one color, to turn permanents face up', () => {
    const abilities = real('Overgrown Zealot').definition.faces[0]?.abilities ?? [];
    expect(abilities[1]).toMatchObject({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      spendOnly: { turnFaceUp: true },
    });
  });
});

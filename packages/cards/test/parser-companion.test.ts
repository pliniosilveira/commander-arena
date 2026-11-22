// "Companion — [condition]" (CR 702.139a): the keyword line and its closed set of conditions. The Jegantha wording is the real Oracle text; the near misses are SYNTHETIC.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { read, readAll } from './parser-p5-helpers';

const REAL =
  'Companion — No card in your starting deck has more than one of the same mana symbol in its mana cost.';

describe('keyword.companion', () => {
  test('lowers to the companion keyword with its condition', () => {
    expect(readAll(REAL, 'creature').abilities).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'companion', condition: { kind: 'noRepeatedManaSymbol' } },
      },
    ]);
  });

  test.each([
    // SYNTHETIC near misses and the condition of another companion (not in the set): left unread.
    'Companion — Each creature card in your starting deck has a different name.',
    'Companion — No card in your starting deck has more than two of the same mana symbol in its mana cost.',
    'Companion — No card in your starting deck has more than one of the same mana symbol in its mana cost. Draw a card.',
    'Companion — No card in your deck has more than one of the same mana symbol in its mana cost.',
    'Companion —',
  ])('is not read: %s', (text) => {
    expect(read(text, 'creature').unparsed).not.toEqual([]);
  });
});

describe('Jegantha, the Wellspring (real corpus text)', () => {
  const corpus = parseGolden(
    readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
  );
  const card = corpus.find((c) => c.name === 'Jegantha, the Wellspring');

  test('is fully supported, with the companion keyword on its face', () => {
    if (card === undefined) throw new Error('no card');
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.status).toBe('supported');
    const abilities = imported.definition.faces[0]?.abilities ?? [];
    expect(abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'companion', condition: { kind: 'noRepeatedManaSymbol' } },
    });
  });
});

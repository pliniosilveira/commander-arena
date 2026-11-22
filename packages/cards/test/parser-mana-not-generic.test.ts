// "This mana can't be spent to pay generic mana costs." (CR 106.6; Jegantha, the Wellspring): the sentence after a mana ability, read into the engine's `spendOnly.notGeneric`.
// The mana line of Jegantha is the real Oracle wording; the rest is SYNTHETIC (near misses the grammar must not read). The real card is checked as a whole at the end: both lines are
// read since the Companion keyword (CR 702.139a), see parser-companion.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped, read, readAll } from './parser-p5-helpers';

const abilities = (text: string, type: 'creature' | 'artifact' = 'creature') =>
  readAll(text, type).abilities;

const LINE = "{T}: Add {W}{U}{B}{R}{G}. This mana can't be spent to pay generic mana costs.";

describe('the mana restriction sentence', () => {
  test('the real mana line of Jegantha, the Wellspring', () => {
    expect(abilities(LINE)).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['W', 'U', 'B', 'R', 'G'] },
        spendOnly: { notGeneric: true },
      },
    ]);
  });

  test('it restricts the mana of any mana ability, on any permanent', () => {
    expect(
      abilities("{T}: Add {R}{G}. This mana can't be spent to pay generic mana costs.", 'artifact'),
    ).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['R', 'G'] },
        spendOnly: { notGeneric: true },
      },
    ]);
  });

  test.each([
    "{T}: Add {R}. This mana can't be spent to pay colored mana costs.",
    "{T}: Add {R}. This mana can't be spent to pay generic mana.",
    "{T}: Add {R}. This mana can't be spent to pay generic mana costs. Draw a card.",
    '{T}: Add {R}. This mana can be spent to pay generic mana costs.',
    "{T}: Add {R}. That mana can't be spent to pay generic mana costs.",
    "{T}: Add {R}. This mana can't be spent to pay generic mana costs. Spend this mana only to activate abilities.",
  ])('is not read: %s', (text) => {
    expect(read(text, 'artifact').unparsed).not.toEqual([]);
  });

  test('as a sentence of its own it is dropped, never run', () => {
    expect(dropped("This mana can't be spent to pay generic mana costs.", 'creature').reason).toBe(
      'unrecognised',
    );
  });
});

describe('Jegantha, the Wellspring as a whole card', () => {
  const corpus = parseGolden(
    readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
  );
  const card = corpus.find((c) => c.name === 'Jegantha, the Wellspring');

  test('is in the corpus', () => {
    expect(card).toBeDefined();
  });

  test('is supported: the Companion line and the mana line are both read', () => {
    if (card === undefined) throw new Error('no card');
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.status).toBe('supported');
    expect(imported.support.unparsed).toEqual([]);
    const face = imported.definition.faces[0];
    expect(face?.abilities.some((a) => a.kind === 'mana' && a.spendOnly?.notGeneric === true)).toBe(
      true,
    );
  });
});

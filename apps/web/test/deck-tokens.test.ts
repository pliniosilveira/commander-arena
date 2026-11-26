// The token section of the deck screen. Cards and Scryfall answers here are SYNTHETIC: invented names and image links.

import type { TokenDefinition } from '@commander-arena/engine';
import { beforeEach, expect, test, vi } from 'vitest';
import type { ImportedEntry } from '../src/import/types';
import { chooseTokenArt, chosenTokenArt } from '../src/ui/board/token-choices';
import { deckTokens, tokensIn } from '../src/ui/import/deck-tokens';
import { parseTokenPrints, tokenPrintsUrl } from '../src/ui/import/token-prints';

const soldier: TokenDefinition = {
  name: 'Soldier',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Soldier'],
  colors: ['W'],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};
const make = (token: unknown) => ({
  kind: 'createToken',
  token,
  count: { kind: 'fixed', value: 1 },
});
const entry = (name: string, effect: unknown): ImportedEntry =>
  ({
    count: 1,
    section: 'main',
    card: {
      stored: { name },
      definition: { faces: [{ abilities: [{ kind: 'triggered', effect }], spell: null }] },
    },
  }) as unknown as ImportedEntry;

test('tokens are found in nested effects, presets and customs alike', () => {
  const found = tokensIn([
    make({ kind: 'preset', preset: 'Treasure' }),
    { kind: 'sequence', effects: [make({ kind: 'custom', definition: soldier })] },
  ]);
  expect(found.map((t) => t.name)).toEqual(['Treasure', 'Soldier']);
});

test('a token made by several cards is listed once, with its cards, sorted by name', () => {
  const tokens = deckTokens([
    entry('B Card', make({ kind: 'custom', definition: soldier })),
    entry('A Card', make({ kind: 'custom', definition: soldier })),
    entry('C Card', make({ kind: 'preset', preset: 'Treasure' })),
    entry('D Card', make({ kind: 'copyOf', object: { kind: 'this' } })),
  ]);
  expect(tokens.map((t) => t.definition.name)).toEqual(['Soldier', 'Treasure']);
  expect(tokens[0]?.cards).toEqual(['B Card', 'A Card']);
});

test('the printings search asks for every printing of the token and keeps the ones with its rules text', () => {
  const url = tokenPrintsUrl(soldier);
  expect(decodeURIComponent(url ?? '')).toContain('unique:prints');
  const card = (id: string, text: string) => ({
    id,
    set: 'tst',
    collector_number: id,
    oracle_text: text,
    image_uris: {
      normal: `https://cards.scryfall.io/normal/${id}.jpg`,
      large: `https://cards.scryfall.io/large/${id}.jpg`,
      art_crop: `https://cards.scryfall.io/art_crop/${id}.jpg`,
    },
  });
  const answer = { data: [card('1', 'Flying'), card('2', ''), card('3', '')] };
  expect(parseTokenPrints(answer, '').map((p) => p.id)).toEqual(['2', '3']);
  expect(parseTokenPrints(answer, '')[0]?.artCrop).toContain('art_crop');
  // No printing says it: all are offered rather than none.
  expect(parseTokenPrints(answer, 'Haste').length).toBe(3);
});

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
});

test('a chosen art is remembered and can be forgotten; foreign links are ignored', () => {
  chooseTokenArt('k', { normal: 'https://cards.scryfall.io/normal/x.jpg' });
  expect(chosenTokenArt('k')?.normal).toContain('x.jpg');
  chooseTokenArt('k', null);
  expect(chosenTokenArt('k')).toBeNull();
});

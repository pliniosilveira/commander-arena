// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 3: the REAL Oracle text of Invincible Hymn (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override and is played through applyAction. Pins: CR 119.5 (a life total that becomes a number: the player gains or loses the difference),
// CR 401.1 (the library is the cards of the player's deck still in it), CR 608.2c (the count is made as the effect resolves).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** A card of the golden corpus with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

const HYMN = 'Invincible Hymn';

describe('Invincible Hymn: your life total becomes the number of cards in your library', () => {
  const hymn = real(HYMN);
  const start = (life: number, library: number) =>
    scenario()
      .define(hymn)
      .seat(0)
      .life(life)
      .hand(HYMN)
      .battlefield(...Array.from({ length: 8 }, () => 'Plains'))
      .library(...Array.from({ length: library }, () => 'Plains'))
      .seat(1)
      .life(20)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a life total below the library size goes up to it', () => {
    const g = start(3, 40);
    g.act(0).cast(HYMN, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(40);
    expect(g.state.seats[1]?.life).toBe(20);
    g.expect.invariants();
  });

  test('a life total above the library size goes down to it', () => {
    const g = start(30, 7);
    g.act(0).cast(HYMN, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(7);
    g.expect.invariants();
  });
});

describe('texts that are not Invincible Hymn are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    'Count the number of cards in your hand. Your life total becomes that number.',
    'Count the number of lands in your library. Your life total becomes that number.',
    'Count the number of cards in your library. Your life total becomes 5.',
    'Your life total becomes that number.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(HYMN, text).support.status).toBe('unsupported');
    });
  }
});

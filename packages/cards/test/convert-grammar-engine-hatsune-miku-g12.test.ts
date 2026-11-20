// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 12: the REAL Oracle text of Song of Freyalise (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override and is played through applyAction. Pins: CR 714 (Saga chapters), CR 613.1f (layer 6: a granted ability), CR 605.1a (a mana ability),
// CR 611.2a and 611.2c (a duration the text states; the set of creatures is fixed as the effect resolves), CR 500.1 (the next turn of its controller).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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

const SONG = 'Song of Freyalise';
const BEARS = 'Grizzly Bears';

describe('Song of Freyalise: chapters I and II give your creatures a mana ability until your next turn; chapter III pumps them', () => {
  const song = real(SONG);
  const start = () =>
    scenario()
      .define(song)
      .seat(0)
      .life(20)
      .hand(SONG)
      .battlefield('Forest', 'Forest', BEARS)
      .library('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(song)).toEqual([]);
  });

  test('chapter I: a creature you control taps for one mana of any color, and the ability is not given to creatures that arrive later (CR 611.2c)', () => {
    const g = start();
    g.act(0).cast(SONG, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).tapForMana(BEARS, { color: 'G' });
    g.expect.pool(0, 'G');
    g.expect.invariants();
  });

  test('the grant ends when your next turn begins (CR 500.1), and chapter II gives it again', () => {
    const g = start();
    g.act(0).cast(SONG, { pay: true });
    g.passAll();
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    // The opponent's turn: the grant still holds until the next turn of its controller begins.
    g.advanceTo('upkeep', { turn: 'next' });
    // My upkeep: the effect has ended (CR 500.1) and chapter II has not been added yet.
    expect(() => g.act(0).tapForMana(BEARS, { color: 'G' })).toThrow();
    g.advanceTo('precombatMain');
    g.passAll();
    g.act(0).tapForMana(BEARS, { color: 'G' });
    g.expect.pool(0, 'G');
  });
});

describe('texts that are not Song of Freyalise are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    'I, II — Until end of turn, creatures you control gain "{T}: Add one mana of any color."\nIII — You gain 1 life.',
    'I, II — Until your next turn, creatures you control gain "{T}: Draw a card."\nIII — You gain 1 life.',
    'I, II — Until your next turn, target creature gains "{T}: Add one mana of any color."\nIII — You gain 1 life.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(SONG, text).support.status).toBe('unsupported');
    });
  }
});

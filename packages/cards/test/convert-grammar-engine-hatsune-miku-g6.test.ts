// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 6: the REAL Oracle text of Soul of Eternity (the corpus's golden.jsonl, taken from the issue) goes through
// the grammar as a card with no override and is played through applyAction. Pins: CR 604.3 (a characteristic-defining ability functions in every zone), CR 208.2a, CR 613.4a
// (layer 7a), CR 119.1 (the life total of a player), CR 704.5f (a creature with toughness 0 or less is put into its owner's graveyard).
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

const SOUL = 'Soul of Eternity';
const BOLT = 'Lightning Bolt';

describe('Soul of Eternity: its power and toughness are each equal to your life total', () => {
  const soul = real(SOUL);
  const start = (life: number, active: 0 | 1 = 0) =>
    scenario()
      .define(soul)
      .seat(0)
      .life(life)
      .battlefield(SOUL)
      .seat(1)
      .life(20)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(soul)).toEqual([]);
  });

  test('it is as big as its controller life total', () => {
    const g = start(40);
    g.expect.pt(SOUL, 40, 40);
  });

  test("it follows the life total as it changes (CR 611.3a): an opponent's Lightning Bolt to its controller", () => {
    const g = start(40, 1);
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
    g.expect.pt(SOUL, 37, 37);
  });

  test('the life total of its controller counts, not the opponent’s', () => {
    const g = start(25);
    g.expect.pt(SOUL, 25, 25);
    g.expect.life(1, 20);
  });
});

describe('texts that are not Soul of Eternity are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "~'s power and toughness are each equal to target player's life total.",
    "~'s power and toughness are each equal to half your life total.",
    "~'s power is equal to your life total.",
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(SOUL, text).support.status).toBe('unsupported');
    });
  }
});

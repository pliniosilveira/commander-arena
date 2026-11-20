// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 7: the REAL Oracle text of Aetherflux Reservoir (the corpus's golden.jsonl, taken from the issue) goes through
// the grammar as a card with no override and is played through applyAction. Pins: CR 601.2i (a spell is cast once it is on the stack and its costs are paid), CR 603.2 (a spell cast
// triggers the ability before it resolves), CR 608.2h (the number of spells is read as the trigger resolves), CR 119.3 (gaining life).
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

const RESERVOIR = 'Aetherflux Reservoir';
const BOLT = 'Lightning Bolt';

describe('Aetherflux Reservoir: whenever you cast a spell, you gain 1 life for each spell you have cast this turn', () => {
  const reservoir = real(RESERVOIR);
  const start = () =>
    scenario()
      .define(reservoir)
      .seat(0)
      .life(20)
      .battlefield(RESERVOIR, 'Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .seat(1)
      .life(20)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(reservoir)).toEqual([]);
  });

  test('the first spell gains 1 life, the second 2 (the spell that triggered it counts)', () => {
    const g = start();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 21);
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 23);
    g.expect.life(1, 14);
    g.expect.invariants();
  });

  test('a spell an opponent casts is no spell you cast: no life is gained', () => {
    const g = scenario()
      .define(reservoir)
      .seat(0)
      .life(20)
      .battlefield(RESERVOIR)
      .seat(1)
      .life(20)
      .battlefield('Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 17);
  });
});

describe('texts that are not Aetherflux Reservoir are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "Whenever you cast a spell, you gain 1 life for each spell you've cast.",
    'Whenever you cast a spell, you gain 1 life for each spell an opponent has cast this turn.',
    "Whenever you cast a spell, you gain 1 life for each creature spell you've cast this turn.",
    "Whenever you cast a spell, you gain 1 life for each spells you've cast this turn.",
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(RESERVOIR, text).support.status).toBe('unsupported');
    });
  }
});

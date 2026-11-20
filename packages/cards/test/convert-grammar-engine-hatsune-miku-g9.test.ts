// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 9: the REAL Oracle text of Gruff Triplets (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override and is played through applyAction. Pins: CR 111.1 and 603.4 (an intervening "if" about a token is checked as the ability triggers and as it
// resolves), CR 707.2 (a token copy has the copiable values), CR 201.2 (a name), CR 603.10a and 400.7 (the power of a creature that died is its last-known power), CR 122.6.
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

const TRIPLETS = 'Gruff Triplets';
const BOLT = 'Lightning Bolt';

describe('Gruff Triplets: two token copies when it enters, counters on its namesakes when it dies', () => {
  const triplets = real(TRIPLETS);
  const cast = () => {
    const g = scenario()
      .define(triplets)
      .seat(0)
      .life(20)
      .hand(TRIPLETS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library('Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .life(20)
      .hand(BOLT, BOLT, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(TRIPLETS, { pay: true });
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(triplets)).toEqual([]);
  });

  test('cast, it makes two token copies, and the copies (tokens) make no more (CR 603.4)', () => {
    const g = cast();
    expect(g.find({ name: TRIPLETS, zone: 'battlefield', seat: 0 })).toHaveLength(3);
    g.passAll();
    expect(g.find({ name: TRIPLETS, zone: 'battlefield', seat: 0 })).toHaveLength(3);
    g.expect.invariants();
  });

  test('when one dies, each creature you control with the name gets counters equal to the power it had', () => {
    const g = cast();
    g.passAll();
    g.act(0).pass();
    const [victim] = g.find({ name: TRIPLETS, zone: 'battlefield', seat: 0 });
    if (victim === undefined) throw new Error('no Gruff Triplets');
    g.act(1).cast(`${BOLT}[0]`, { targets: [victim.id], pay: true });
    g.passAll();
    const left = g.find({ name: TRIPLETS, zone: 'battlefield', seat: 0 });
    expect(left).toHaveLength(2);
    for (const o of left) expect(o.counters['+1/+1']).toBe(3);
    g.expect.invariants();
  });
});

describe('texts that are not Gruff Triplets are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "When ~ enters, if it isn't a token, create two tokens that are copies of it. When ~ dies, put a number of +1/+1 counters equal to its power on each creature you control named Bob.",
    "When ~ enters, if it isn't a Treasure token, create two tokens that are copies of it.",
    'When ~ dies, put a number of +1/+1 counters equal to its power on each creatures you control named ~.',
    'When ~ dies, put a number of +1/+1 counters equal to its power on each creature your opponents control named ~.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(TRIPLETS, text).support.status).toBe('unsupported');
    });
  }
});

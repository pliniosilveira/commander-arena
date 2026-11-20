// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 8: the REAL Oracle text of Break Down (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override and is played through applyAction, and the Junk token it creates is played too. Pins: CR 111.10t (the Junk token and its ability), CR 111.10
// (a predefined token), CR 701.8 (Destroy), CR 602.5d (Activate only as a sorcery), CR 118.12 and 601.2: the card exiled with the ability may be played this turn.
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

const BREAK = 'Break Down';
const SOL_RING = 'Sol Ring';
const JUNK = 'Junk';

describe('Break Down: destroy target artifact or enchantment, then create a Junk token', () => {
  const breakDown = real(BREAK);
  const start = () =>
    scenario()
      .define(breakDown)
      .seat(0)
      .life(20)
      .hand(BREAK)
      .battlefield('Forest', 'Forest', 'Forest')
      .library('Forest', 'Mountain', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield(SOL_RING)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(breakDown)).toEqual([]);
  });

  test('the artifact is destroyed and the controller of the spell gets a colorless Junk artifact', () => {
    const g = start();
    g.act(0).cast(BREAK, { targets: [SOL_RING], pay: true });
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    g.expect.zone(JUNK, 'battlefield', { seat: 0 });
    g.expect.derived(JUNK, { types: ['artifact'], subtypes: ['Junk'], colors: [] });
    g.expect.invariants();
  });

  test('the Junk is tapped and sacrificed: the top card of the library is exiled and may be played this turn (CR 111.10t)', () => {
    const g = start();
    g.act(0).cast(BREAK, { targets: [SOL_RING], pay: true });
    g.passAll();
    g.act(0).activate(JUNK, { pay: true });
    g.passAll();
    expect(g.find({ name: JUNK, zone: 'battlefield' })).toHaveLength(0);
    expect(g.find({ name: 'Forest', zone: 'exile', seat: 0 })).toHaveLength(1);
    g.act(0).playLand({ name: 'Forest', zone: 'exile', seat: 0 });
    expect(g.find({ name: 'Forest', zone: 'exile', seat: 0 })).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('texts that are not Break Down are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    'Destroy target artifact or enchantment. Create a Junk.',
    'Destroy target artifact or enchantment. Create a Junk creature token.',
    'Destroy target artifact or enchantment. Create a Rubbish token.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(BREAK, text).support.status).toBe('unsupported');
    });
  }
});

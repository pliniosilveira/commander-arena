// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 11: the REAL Oracle text of Bramble Sovereign (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override and is played through applyAction. Pins: CR 603.5 (an optional cost of a triggered ability: "you may pay"), CR 608.2c ("if you do"), CR 707.2
// (a token copy has the copiable values), CR 111.2 (the player who creates a token owns it and controls it: here, the controller of the creature that entered), CR 111.1 (a token
// creature that enters does not trigger "nontoken").
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

const SOVEREIGN = 'Bramble Sovereign';
const BEARS = 'Grizzly Bears';

describe('Bramble Sovereign: pay {1}{G} and the controller of an entering nontoken creature gets a copy', () => {
  const sovereign = real(SOVEREIGN);
  /** `caster` casts Grizzly Bears; seat 0 has the Sovereign and two Forests. */
  const start = (caster: 0 | 1) =>
    scenario()
      .define(sovereign)
      .seat(0)
      .life(20)
      .battlefield(SOVEREIGN, 'Forest', 'Forest', ...(caster === 0 ? ['Forest', 'Forest'] : []))
      .hand(...(caster === 0 ? [BEARS] : []))
      .library('Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .life(20)
      .battlefield(...(caster === 1 ? ['Forest', 'Forest'] : []))
      .hand(...(caster === 1 ? [BEARS] : []))
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: caster, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(sovereign)).toEqual([]);
  });

  test("an opponent's creature enters, its controller makes the copy when you pay", () => {
    const g = start(1);
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 1 })).toHaveLength(2);
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(0);
    g.expect.invariants();
  });

  test('declining the payment makes no copy', () => {
    const g = start(1);
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 1 })).toHaveLength(1);
  });

  test('your own creature enters: you get the copy, and the token copy does not make another (nontoken)', () => {
    const g = start(0);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(2);
  });
});

describe('texts that are not Bramble Sovereign are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "Whenever another nontoken creature enters, you may pay {1}{G}. If you do, that creature's controller creates a token that's a copy of that creature, except it has haste.",
    "Whenever another nontoken creature enters, you may pay {1}{G}. If you do, that creature's controller creates a token that's a copy of that creature's controller.",
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(SOVEREIGN, text).support.status).toBe('unsupported');
    });
  }
});

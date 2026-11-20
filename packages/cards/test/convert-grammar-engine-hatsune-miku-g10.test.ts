// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 10: the REAL Oracle text of Rhys the Redeemed (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override and is played through applyAction. The tokens it copies come from a SYNTHETIC spell named so. Pins: CR 707.2 (a token copy has the copiable
// values), CR 111.4, CR 608.2c (the group is fixed as the effect resolves, so the new tokens are not copied again), CR 602.2 (activating: mana and tap are the costs).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const RHYS = 'Rhys the Redeemed';
const MAKER = parsed(
  'SYNTHETIC Elf Token Maker',
  'Sorcery',
  'Create two 1/1 green Elf Warrior creature tokens.',
  { manaCost: '{G}', colors: ['G'] },
);

describe('Rhys the Redeemed: for each creature token you control, a token that is a copy of it', () => {
  const rhys = real(RHYS);
  const start = () => {
    const g = scenario()
      .define(rhys)
      .define(MAKER)
      .seat(0)
      .life(20)
      .hand(MAKER.name)
      .battlefield(RHYS, ...Array.from({ length: 8 }, () => 'Forest'))
      .library('Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(rhys)).toEqual([]);
  });

  test('two Elf Warrior tokens become four; Rhys, who is no token, is not copied (CR 608.2c)', () => {
    const g = start();
    expect(g.find({ name: 'Elf Warrior', zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.act(0).activate(RHYS, { ability: 1, pay: true });
    g.passAll();
    expect(g.find({ name: 'Elf Warrior', zone: 'battlefield', seat: 0 })).toHaveLength(4);
    expect(g.find({ name: RHYS, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.invariants();
  });
});

describe('texts that are not Rhys the Redeemed are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "{4}{G/W}{G/W}, {T}: For each creature you control, create a token that's a copy of that creature.",
    "{4}{G/W}{G/W}, {T}: For each creature token an opponent controls, create a token that's a copy of that creature.",
    "{4}{G/W}{G/W}, {T}: For each creature token you control, create a token that's a copy of that creature, except it has haste.",
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(RHYS, text).support.status).toBe('unsupported');
    });
  }
});

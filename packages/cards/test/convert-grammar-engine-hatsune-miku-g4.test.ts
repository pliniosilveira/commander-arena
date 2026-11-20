// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 4: the REAL Oracle text of Shalai, Voice of Plenty (the corpus's golden.jsonl, taken from the issue) goes
// through the grammar as a card with no override and is played through applyAction. Pins: CR 702.11b (hexproof: the controller's opponents can't target), CR 604.1 and
// 611.3a (a static ability applies to whatever matches at any moment), "other" leaves out the permanent itself.
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

const SHALAI = 'Shalai, Voice of Plenty';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

describe('Shalai: you, your planeswalkers and your other creatures have hexproof', () => {
  const shalai = real(SHALAI);
  const start = () =>
    scenario()
      .define(shalai)
      .seat(0)
      .life(20)
      .battlefield(SHALAI, BEARS)
      .seat(1)
      .life(20)
      .hand(BOLT, BOLT, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .at('precombatMain', { active: 1, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(shalai)).toEqual([]);
    expect(JSON.stringify(shalai.faces)).toContain('planeswalker');
  });

  test('an opponent can target neither you nor your other creature (CR 702.11b)', () => {
    const g = start();
    expect(() => g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true })).toThrow();
    expect(() => g.act(1).cast(`${BOLT}[0]`, { targets: [BEARS], pay: true })).toThrow();
    g.expect.invariants();
  });

  test('Shalai itself is not hexproof ("other creatures"), and the opponent is not protected', () => {
    const g = start();
    g.act(1).cast(`${BOLT}[0]`, { targets: [SHALAI], pay: true });
    g.passAll();
    g.expect.damage(SHALAI, 3);
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
  });
});

describe('texts that are not Shalai are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    'You, planeswalkers you control, and creatures you control have hexproof.',
    'You, planeswalkers you control, and other creatures you control have shroud.',
    'You, artifacts you control, and other creatures you control have hexproof.',
    'You, planeswalkers you control, and other creatures you control have hexproof until end of turn.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(SHALAI, text).support.status).toBe('unsupported');
    });
  }
});

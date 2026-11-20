// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 13: the REAL Oracle text of Ancient Cornucopia (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override and is played through applyAction. Stand-in spells (two colors) are SYNTHETIC and named so. Pins: CR 105.2 (the number of colors an object
// has; colorless is none, CR 105.2c), CR 601.2i (a cast spell), CR 603.5 (a "may" trigger), the instruction "Do this only once each turn".
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

const CORNUCOPIA = 'Ancient Cornucopia';
const BOLT = 'Lightning Bolt';
const SOL_RING = 'Sol Ring';
const GRUUL = parsed('SYNTHETIC Gruul Spell', 'Instant', 'Draw a card.', {
  manaCost: '{R}{G}',
  colors: ['R', 'G'],
});

describe('Ancient Cornucopia: gain 1 life for each color of a colored spell you cast, once each turn', () => {
  const cornucopia = real(CORNUCOPIA);
  const start = () =>
    scenario()
      .define(cornucopia)
      .define(GRUUL)
      .seat(0)
      .life(20)
      .battlefield(CORNUCOPIA, 'Mountain', 'Mountain', 'Forest', 'Forest')
      .hand(GRUUL.name, BOLT, SOL_RING)
      .library('Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(cornucopia)).toEqual([]);
  });

  test('a two-color spell gains 2 life; a second colored spell the same turn gains nothing', () => {
    const g = start();
    g.act(0).cast(GRUUL.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 22);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 22);
    g.expect.invariants();
  });

  test('a one-color spell gains 1 life', () => {
    const g = start();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 21);
  });

  test('a colorless spell does not trigger it, and does not use up the once-each-turn', () => {
    const g = start();
    g.act(0).cast(SOL_RING, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 21);
  });

  test('declining gains nothing', () => {
    const g = start();
    g.act(0).cast(GRUUL.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.life(0, 20);
  });
});

describe('texts that are not Ancient Cornucopia are dropped, never half run (SYNTHETIC)', () => {
  const tail = '\n{T}: Add one mana of any color.';
  const lines = [
    `Whenever you cast a spell that's one or more colors, you may gain 1 life for each of that card's colors. Do this only once each turn.${tail}`,
    `Whenever you cast a spell that's one or more colors, you may gain 1 life for each color. Do this only once each turn.${tail}`,
    `Whenever you cast a red spell that's one or more colors, you may gain 1 life. Do this only once each turn.${tail}`,
    `Whenever you cast a spell that's one or more colors that targets a creature, you may gain 1 life. Do this only once each turn.${tail}`,
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(CORNUCOPIA, text).support.status).toBe('unsupported');
    });
  }
});

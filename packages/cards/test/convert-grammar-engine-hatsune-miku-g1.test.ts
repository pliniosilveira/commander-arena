// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 1: the REAL Oracle text of Restless Prairie (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction. Pins: CR 205.1b (a land that becomes a creature is still a land),
// CR 611.2a (until end of turn), CR 613.1d (types), CR 613.1e (colors), CR 613.4b (base power and toughness).
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

const PRAIRIE = 'Restless Prairie';

describe('Restless Prairie: a land that becomes a 3/3 green and white Llama until end of turn', () => {
  const prairie = real(PRAIRIE);
  const start = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(prairie)
      .battlefield(PRAIRIE, { tapped: false })
      .battlefield('Forest', 'Plains', 'Forest', 'Plains')
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it becomes a 3/3 green and white Llama creature and is still a land', () => {
    const g = start();
    g.act(0).activate(PRAIRIE, { pay: true });
    g.passAll();
    g.expect.derived(PRAIRIE, {
      types: ['land', 'creature'],
      subtypes: ['Llama'],
      colors: ['G', 'W'],
    });
    g.expect.pt(PRAIRIE, 3, 3);
    g.expect.invariants();
  });

  test('the effect ends with the turn (CR 611.2a)', () => {
    const g = start();
    g.act(0).activate(PRAIRIE, { pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(PRAIRIE, { types: ['land'], subtypes: [], colors: [] });
  });
});

describe('texts that are not Restless Prairie are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "{2}{G}{W}: This land becomes a 3/3 green and white Llama creature until your next turn. It's still a land.",
    '{2}{G}{W}: This land becomes a 3/3 green and white Llama creature until end of turn.',
    "{2}{G}{W}: Target land becomes a 3/3 green and white Llama creature until end of turn. It's still a land.",
    "{2}{G}{W}: This land becomes a green and white Llama creature until end of turn. It's still a land.",
  ];
  for (const text of lines) {
    test(text, () => {
      const imported = withText(PRAIRIE, text);
      expect(imported.support.status).toBe('unsupported');
    });
  }
});

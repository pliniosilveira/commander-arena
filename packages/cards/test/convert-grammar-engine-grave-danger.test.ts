// The Grave Danger deck (issue 159): the REAL Oracle text of its cards (the corpus's golden.jsonl, taken from the
// issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played
// through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins: CR 120.2 (Damage), CR 608.2c (an instruction counts as it resolves), CR 603.6a (enters-the-battlefield triggers).
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

const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Lotleth Giant: "When this creature enters, it deals 1 damage to target opponent for each creature card in your graveyard."', () => {
  const giant = real('Lotleth Giant');
  const start = (graveyard: readonly string[]) =>
    scenario()
      .define(giant)
      .seat(0)
      .library(...LIBRARY)
      .hand(giant.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .graveyard(...graveyard)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(giant)).toEqual([]);
  });

  test('two creature cards in the graveyard: two damage, a land card does not count', () => {
    const g = start([BEARS, BEARS, 'Swamp']);
    g.act(0).cast(giant.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 18);
    g.expect.invariants();
  });

  test('an empty graveyard: no damage', () => {
    const g = start([]);
    g.act(0).cast(giant.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 20);
  });
});

// Draconic Dissent deck (issue 167): the REAL Oracle text of Curse of Verbosity goes through the grammar as a card with
// no override and is played through applyAction. Pins: CR 508.6 (a player attacking a player), CR 508.3b (attack triggers).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

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

describe('Curse of Verbosity: "Whenever enchanted player is attacked, you draw a card. Each opponent attacking that player does the same."', () => {
  const curse = real('Curse of Verbosity');
  const start = () =>
    scenario()
      .define(curse)
      .seat(0)
      .library(...LIBRARY)
      .hand(curse.name)
      .battlefield('Island', 'Island', 'Island', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Llanowar Elves')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(curse)).toEqual([]);
  });

  test('the enchanted player is attacked by its controller: one card drawn, the attacker is not an opponent', () => {
    const g = start();
    g.act(0).cast(curse.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 0);
    g.expect.invariants();
  });

  test('I enchant myself and an opponent attacks me: I draw and so does the opponent attacking me', () => {
    const g = start();
    g.act(0).cast(curse.name, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 4 });
    g.act(1).attack('Llanowar Elves');
    g.passAll();
    g.expect.handSize(0, 1);
    // Seat 1 also drew for its turn (turn 4): one card from its draw step, one from the curse.
    g.expect.handSize(1, 2);
    g.expect.invariants();
  });

  test('another player being attacked does nothing', () => {
    const g = start();
    g.act(0).cast(curse.name, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.passAll();
    g.expect.handSize(0, 0);
  });
});

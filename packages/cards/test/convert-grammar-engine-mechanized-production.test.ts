// Mechanized Production (Deep Clue Sea deck, issue 128): "Enchant artifact you control" and "At the beginning of your upkeep, create a token that's a copy of enchanted artifact. Then if you
// control eight or more artifacts with the same name as one another, you win the game." The REAL Oracle text (the golden corpus) goes through the grammar with no override, is defined in an
// engine scenario and is played through applyAction.
// Rules pinned: CR 707.2 and 111.4 (the token has the copiable values of the artifact, so its name), 303.4b (enchanted artifact), 201.2 (same name), 608.2c ("Then if": read after the token
// exists), 104.2b (an effect may state that a player wins the game), 101.4 (three seats: both opponents lose).
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const AURA = real('Mechanized Production');
const RING = 'Sol Ring';
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('Mechanized Production', () => {
  const game = (rings: number) =>
    scenario({ seats: 3 })
      .define(AURA)
      .seat(0)
      .library(...LIBRARY)
      .hand(AURA.name)
      .battlefield(
        'Island',
        'Island',
        'Island',
        'Island',
        ...Array.from({ length: rings }, () => RING),
      )
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(AURA)).toEqual([]);
  });

  test('each of my upkeeps a token copy of the enchanted artifact is made; with fewer than eight of that name nothing else happens', () => {
    const g = game(1);
    g.act(0).cast(AURA.name, { targets: [RING], pay: true });
    g.passAll();
    g.expect.attached(AURA.name, RING);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.zone(RING, 'battlefield', { seat: 0, count: 2 });
    g.expect.hasLost(1, false);
    g.expect.hasLost(2, false);
    g.expect.invariants();
  });

  test('the eighth artifact with the same name wins the game', () => {
    const g = game(7);
    g.act(0).cast(AURA.name, { targets: [`${RING}[0]`], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.zone(RING, 'battlefield', { seat: 0, count: 8 });
    g.expect.gameOver({ win: 0 });
  });
});

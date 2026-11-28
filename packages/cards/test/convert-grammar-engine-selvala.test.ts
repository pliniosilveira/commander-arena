// Selvala, Explorer Returned (Deep Clue Sea deck, issue 128): "Parley — {T}: Each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain
// 1 life. Then each player draws a card." The REAL Oracle text (the golden corpus) goes through the grammar with no override, is defined in an engine scenario and is played through
// applyAction as a mana ability (it has no target and adds mana, CR 605.1a, so it does not use the stack, CR 605.3b).
// Rules pinned: CR 701.20a (the revealed cards stay on top, so each player draws what was shown), CR 121.1, 101.4 (three seats: every player reveals and draws), and an empty-land top card
// gives no mana and no life.
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

const SELVALA = real('Selvala, Explorer Returned');
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';

describe('Selvala, Explorer Returned', () => {
  const game = () =>
    scenario({ seats: 3 })
      .define(SELVALA)
      .seat(0)
      .library(BEARS, 'Island', 'Island')
      .battlefield(SELVALA.name)
      .seat(1)
      .library('Island', SPIDER, 'Island')
      .seat(2)
      .library(SPIDER, 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(SELVALA)).toEqual([]);
  });

  test('each nonland card revealed gives {G} and 1 life, then every player draws the card shown', () => {
    const g = game();
    g.act(0).tapForMana(SELVALA.name);
    g.expect.pool(0, { G: 2 });
    g.expect.life(0, 42);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);
    g.expect.handSize(2, 1);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 2 });
    g.expect.tapped(SELVALA.name, true);
    g.expect.invariants();
  });

  test('lands revealed give nothing, an empty library reveals nothing, and the cards are still drawn', () => {
    const g = scenario({ seats: 3 })
      .define(SELVALA)
      .seat(0)
      .library('Island', 'Island')
      .battlefield(SELVALA.name)
      .seat(1)
      .library('Island', 'Island')
      .seat(2)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).tapForMana(SELVALA.name);
    g.expect.pool(0, {});
    g.expect.life(0, 40);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);
    g.expect.invariants();
  });
});

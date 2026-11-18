// Keen Duelist: the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, reads as supported, has the ability of its SYNTHETIC sibling of the
// engine fixtures (`synthetic-reveal-duel.ts`), and is played through applyAction, so the node the parser writes is what the engine runs. Pins: CR 701.20a (reveal), CR 119.3 (each player
// loses life equal to the mana value of the card the OTHER player revealed), CR 202.3 (mana value).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
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

const duelist = real('Keen Duelist');

describe('Keen Duelist', () => {
  test('is valid and has the abilities of its SYNTHETIC sibling', () => {
    expect(validateCard(duelist)).toEqual([]);
    const twin = syntheticCard('SYNTHETIC Reveal Duelist').faces[0];
    expect(duelist.faces[0]?.abilities).toEqual(twin?.abilities);
  });

  test('at the upkeep: each loses life equal to the card the other revealed, and each takes their card', () => {
    const g = scenario()
      .define(duelist)
      .seat(0)
      .life(20)
      .library('Serra Angel', 'Plains')
      .battlefield(duelist.name)
      .seat(1)
      .life(20)
      .library('Lightning Bolt', 'Plains')
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.pass();
    g.pass();
    g.expect.life(0, 19);
    g.expect.life(1, 15);
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'hand', { seat: 1 });
    g.expect.invariants();
  });
});

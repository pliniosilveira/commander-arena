// Painful Truths (issue 310): "Converge — You draw X cards and lose X life, where X is the number of colors of mana spent to cast
// this spell." The real card comes from the golden corpus through the Oracle text parser, then runs in the engine.
// Pins: CR 105.1 (the five colors; colorless is not a color), CR 601.2h (the mana spent to cast a spell), CR 121.1 (draw), CR 119.3
// (lose life).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const TRUTHS = real('Painful Truths');
const NAME = TRUTHS.name;
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const game = (...lands: string[]) =>
  scenario()
    .define(TRUTHS)
    .seat(0)
    .hand(NAME)
    .battlefield(...lands)
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .build();

describe('Painful Truths', () => {
  test.each([
    ['one color (three Swamps)', ['Swamp', 'Swamp', 'Swamp'], 1],
    ['two colors (Swamp, Swamp, Island)', ['Swamp', 'Swamp', 'Island'], 2],
    ['three colors (Swamp, Island, Mountain)', ['Swamp', 'Island', 'Mountain'], 3],
  ] as const)('%s: draws X cards and loses X life', (_, lands, x) => {
    const g = game(...lands);
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.handSize(0, x);
    g.expect.life(0, 40 - x);
    g.expect.invariants();
  });

  test('colorless mana is no color: a Swamp and Sol Ring spend one color', () => {
    const g = game('Swamp', 'Sol Ring');
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(0, 39);
  });
});

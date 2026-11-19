// Fell the Mighty (the top-5 card ranking): the REAL card of the golden corpus, read through the grammar only and played through applyAction. "Destroy all creatures with
// power greater than target creature's power." is the engine's `destroy` of an `each` selector whose filter has `powerGreaterThan` of the target (CR 208.1, 608.2c, 701.8).
// Stand-ins are the engine's real fixtures (Raging Goblin 1/1, Grizzly Bears 2/2, Serra Angel 4/4).
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
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FELL = real('Fell the Mighty');
const GOBLIN = 'Raging Goblin';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';

const game = () =>
  scenario()
    .define(FELL)
    .seat(0)
    .hand(FELL.name)
    .battlefield('Plains', { count: 5 })
    .battlefield(BEARS)
    .seat(1)
    .battlefield(GOBLIN, ANGEL, BEARS)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('Fell the Mighty', () => {
  test('reads as a sorcery that targets a creature and destroys the creatures with more power', () => {
    expect(FELL.faces[0]?.spell?.targets?.map((t) => t.id)).toEqual(['t1']);
    expect(JSON.stringify(FELL.faces[0]?.spell?.effect)).toContain('powerGreaterThan');
  });

  test('targeting the opponent’s 2/2: the Serra Angel dies; both 2/2s and the 1/1 live', () => {
    const g = game();
    g.act(0).cast(FELL.name, { pay: true, targets: [{ name: BEARS, nth: 1 }] });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(GOBLIN, 'battlefield', { seat: 1 });
  });

  test('targeting the 1/1: the creatures with power above 1 die on both sides', () => {
    const g = game();
    g.act(0).cast(FELL.name, { pay: true, targets: [GOBLIN] });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(GOBLIN, 'battlefield', { seat: 1 });
  });

  test('targeting the strongest creature destroys nothing', () => {
    const g = game();
    g.act(0).cast(FELL.name, { pay: true, targets: [ANGEL] });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });
});

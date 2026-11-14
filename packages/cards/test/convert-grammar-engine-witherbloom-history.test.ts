import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const FILLER = Array.from({ length: 15 }, () => 'Plains');
function real(name: string): CardDefinition {
  const record = GOLDEN.find((c) => c.name === name);
  if (record === undefined) throw new Error(name);
  const card = importCard(fromGoldenCard(record), undefined, NO_OVERRIDES);
  expect(card.support.unparsed, name).toEqual([]);
  expect(validateCard(card.definition), name).toEqual([]);
  return card.definition;
}

describe('Witherbloom history: real imports executed through the scenario DSL', () => {
  test('Bogbeast counts all life gained, not net life, and snapshots its pump', () => {
    const card = real('Blossoming Bogbeast');
    const g = scenario().define(card).seat(0)
      .battlefield(card.name, 'Plains', 'Mountain').hand('SYNTHETIC Mend', 'Lightning Bolt')
      .library(...FILLER).seat(1).library(...FILLER).build();
    g.act(0).cast('SYNTHETIC Mend', { pay: true }); g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true }); g.passAll();
    g.advanceTo('declareAttackers'); g.act(0).attack(card.name); g.passAll();
    g.expect.pt(card.name, 8, 8);
    g.expect.derived(card.name, { keywords: ['trample'] });
    g.expect.life(0, 42);
  });

  test('Daemogoth life gain from combat contributes to its end step drain', () => {
    const card = real('Defiling Daemogoth');
    const g = scenario().define(card).seat(0).battlefield(card.name, 'Grizzly Bears')
      .library(...FILLER).seat(1).library(...FILLER).build();
    g.advanceTo('declareAttackers'); g.act(0).attack('Grizzly Bears');
    g.advanceTo('end'); g.passAll();
    g.expect.life(0, 41); g.expect.life(1, 37);
  });

  test('Gyome counts nontoken creature entries even after they die and taps its protected target', () => {
    const card = real('Gyome, Master Chef');
    const g = scenario().define(card).seat(0).battlefield(card.name, 'Forest', 'Mountain', 'Plains')
      .hand("Healer's Hawk", 'Lightning Bolt').library(...FILLER).seat(1).library(...FILLER).build();
    g.act(0).cast("Healer's Hawk", { pay: true }); g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: ["Healer's Hawk"], pay: true }); g.passAll();
    g.advanceTo('end'); g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0 });
    g.act(0).activate(card.name, { targets: [card.name], pay: true }); g.passAll();
    g.expect.derived(card.name, { keywords: ['trample', 'indestructible'] });
    g.expect.tapped(card.name, true);
  });

  test('Mortality Spear discounts only after an actual gain this turn', () => {
    const card = real('Mortality Spear');
    const g = scenario().define(card).seat(0).battlefield('Plains', 'Swamp', 'Forest')
      .hand('SYNTHETIC Mend', card.name).library(...FILLER).seat(1)
      .battlefield('Grizzly Bears').library(...FILLER).build();
    g.act(0).cast('SYNTHETIC Mend', { pay: true }); g.passAll();
    g.act(0).cast(card.name, { targets: ['Grizzly Bears'], pay: true }); g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard');
  });

  test('Gorma counts earlier deaths, not graveyard contents or opponents, and itself gets no self replacement', () => {
    const card = real('Gorma, the Gullet');
    const g = scenario().define(card).seat(0).battlefield(card.name, 'Mountain', 'Plains')
      .hand('Lightning Bolt', "Healer's Hawk").library(...FILLER).seat(1)
      .battlefield('Grizzly Bears').library(...FILLER).build();
    g.act(0).cast('Lightning Bolt', { targets: [card.name], pay: true }); g.passAll();
    g.act(0).cast("Healer's Hawk", { pay: true }); g.passAll();
    g.expect.pt("Healer's Hawk", 1, 1);
  });
});

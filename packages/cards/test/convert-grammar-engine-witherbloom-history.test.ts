import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  fixtureCard,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const FILLER = Array.from({ length: 15 }, () => 'Plains');
const TOKEN = 'SYNTHETIC History Pest';
function tokenSpell(): CardDefinition {
  const base = syntheticCard('SYNTHETIC Mend');
  const face = base.faces[0];
  const bear = fixtureCard('Grizzly Bears').faces[0];
  if (face === undefined || bear === undefined) throw new Error('missing fixture');
  const name = 'SYNTHETIC History Pest Summons';
  return {
    ...base,
    name,
    faces: [
      {
        ...face,
        name,
        manaCost: ['0'],
        spell: {
          targets: [],
          effect: {
            kind: 'createToken',
            count: 1,
            token: { kind: 'custom', definition: { ...bear, name: TOKEN, manaCost: null } },
          },
        },
      },
    ],
  };
}
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
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, 'Plains', 'Mountain')
      .hand('SYNTHETIC Mend', 'Lightning Bolt')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast('SYNTHETIC Mend', { pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(card.name);
    g.passAll();
    g.expect.pt(card.name, 8, 8);
    g.expect.derived(card.name, { keywords: ['trample'] });
    g.expect.life(0, 42);
  });

  test('Daemogoth life gain from combat contributes to its end step drain', () => {
    const card = real('Defiling Daemogoth');
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, 'Grizzly Bears')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 37);
  });

  test('Gyome counts nontoken creature entries even after they die and taps its protected target', () => {
    const card = real('Gyome, Master Chef');
    const maker = tokenSpell();
    const g = scenario()
      .define(card)
      .define(maker)
      .seat(0)
      .battlefield(card.name, 'Forest', 'Mountain', 'Plains')
      .hand(maker.name, "Healer's Hawk", 'Lightning Bolt')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(maker.name, { pay: true });
    g.passAll();
    g.act(0).cast("Healer's Hawk", { pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: ["Healer's Hawk"], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
    g.act(0).activate(card.name, { targets: [card.name], pay: true });
    g.passAll();
    g.expect.derived(card.name, { keywords: ['trample', 'indestructible'] });
    g.expect.tapped(card.name, true);
  });

  test('Mortality Spear discounts only after an actual gain this turn', () => {
    const card = real('Mortality Spear');
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield('Plains', 'Swamp', 'Forest')
      .hand('SYNTHETIC Mend', card.name)
      .library(...FILLER)
      .seat(1)
      .battlefield('Grizzly Bears')
      .library(...FILLER)
      .build();
    g.expect.illegal(0, { cast: card.name });
    g.act(0).cast('SYNTHETIC Mend', { pay: true });
    g.passAll();
    g.expect.legal(0, { cast: card.name });
    g.act(0).cast(card.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard');
  });

  test('a prevented life gain does not discount Mortality Spear', () => {
    const card = real('Mortality Spear');
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield('Plains', 'Swamp', 'Forest')
      .hand('SYNTHETIC Mend', card.name)
      .library(...FILLER)
      .seat(1)
      .battlefield('SYNTHETIC Joyless Idol', 'Grizzly Bears')
      .library(...FILLER)
      .build();
    g.act(0).cast('SYNTHETIC Mend', { pay: true });
    g.passAll();
    g.expect.illegal(0, { cast: card.name });
  });

  test('Gorma sees deaths before it entered and modifies its own entry as well as later creatures', () => {
    const card = real('Gorma, the Gullet');
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield('Grizzly Bears', 'Mountain', 'Forest', 'Swamp', 'Plains', 'Plains')
      .hand('Lightning Bolt', card.name, "Healer's Hawk")
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    g.expect.counters(card.name, { '+1/+1': 1 });
    g.act(0).cast("Healer's Hawk", { pay: true });
    g.passAll();
    g.expect.counters("Healer's Hawk", { '+1/+1': 1 });
  });

  test('another friendly death grows Gorma and increases the counters later creatures enter with', () => {
    const card = real('Gorma, the Gullet');
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, 'Grizzly Bears', 'Mountain', 'Plains')
      .hand('Lightning Bolt', "Healer's Hawk")
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.counters(card.name, { '+1/+1': 1 });
    g.act(0).cast("Healer's Hawk", { pay: true });
    g.passAll();
    g.expect.counters("Healer's Hawk", { '+1/+1': 1 });
  });

  test('Gyome counts itself when cast this turn', () => {
    const card = real('Gyome, Master Chef');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Forest', 'Swamp', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0 });
  });

  test('an absent Gorma no longer modifies creature entries', () => {
    const card = real('Gorma, the Gullet');
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, 'Mountain', 'Plains')
      .hand('Lightning Bolt', "Healer's Hawk")
      .library(...FILLER)
      .seat(1)
      .battlefield('Grizzly Bears')
      .library(...FILLER)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [card.name], pay: true });
    g.passAll();
    g.act(0).cast("Healer's Hawk", { pay: true });
    g.passAll();
    g.expect.pt("Healer's Hawk", 1, 1);
  });

  test('Gorma ignores token entries but counts token deaths toward later nontoken entries', () => {
    const card = real('Gorma, the Gullet');
    const maker = tokenSpell();
    const g = scenario()
      .define(card)
      .define(maker)
      .seat(0)
      .battlefield(card.name, 'Grizzly Bears', 'Mountain', 'Mountain', 'Plains')
      .hand(maker.name, 'Lightning Bolt', 'Lightning Bolt', "Healer's Hawk")
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast({ name: 'Lightning Bolt', nth: 0 }, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).cast(maker.name, { pay: true });
    g.passAll();
    g.expect.counters(TOKEN, {});
    g.act(0).cast('Lightning Bolt', { targets: [TOKEN], pay: true });
    g.passAll();
    g.act(0).cast("Healer's Hawk", { pay: true });
    g.passAll();
    g.expect.counters(card.name, { '+1/+1': 2 });
    g.expect.counters("Healer's Hawk", { '+1/+1': 2 });
  });
});

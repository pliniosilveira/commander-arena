import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const NAMES = [
  'Blight Mound',
  'Bloodghast',
  'Ohran Frostfang',
  'Feral Appetite',
  'Pest Rescuer',
  "Teacher's Pest",
  'Ribtruss Roaster',
];

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`Missing corpus card ${name}`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

describe('issue58 group A real imports', () => {
  test.each(NAMES)('%s reads entirely and validates', (name) => {
    expect(validateCard(real(name))).toEqual([]);
  });

  const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

  test('attacking-only Pest lords and combat draw follow the current combat', () => {
    const cards = ['Blight Mound', 'Feral Appetite', 'Ohran Frostfang', "Teacher's Pest"].map(real);
    const g = scenario()
      .define(...cards)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(...cards.map((c) => c.name), 'Grizzly Bears')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.expect.pt("Teacher's Pest", 1, 1);
    g.playCombat({ attack: ["Teacher's Pest", 'Grizzly Bears'], until: 'declareBlockers' });
    g.expect.pt("Teacher's Pest", 3, 1);
    g.expect.derived("Teacher's Pest", { keywords: ['menace', 'deathtouch'] });
    g.expect.derived('Grizzly Bears', { keywords: ['deathtouch'] });
    g.playCombat({ until: 'postcombatMain' });
    g.expect.life(0, 41);
    g.expect.life(1, 35);
    expect(g.find({ zone: 'hand', seat: 0 })).toHaveLength(2);
    g.expect.pt("Teacher's Pest", 1, 1);
    g.expect.invariants();
  });

  test.each([9, 10, 11])('Bloodghast checks opponent life %s and returns optionally on landfall', (life) => {
    const card = real('Bloodghast');
    const g = scenario()
      .define(card)
      .seat(0)
      .library(...LIBRARY)
      .graveyard(card.name)
      .hand('Forest')
      .seat(1)
      .life(life)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).chooseOption('yes');
    g.expect.zone(card.name, 'battlefield', { seat: 0 });
    const keywords = g.find({ name: card.name, zone: 'battlefield' })[0];
    expect(keywords).toBeDefined();
    if (life <= 10) g.expect.derived(card.name, { keywords: ['haste'] });
    g.expect.invariants();
  });

  test("Teacher's Pest returns tapped and only activates from its owner's graveyard", () => {
    const card = real("Teacher's Pest");
    const g = scenario()
      .define(card)
      .seat(0)
      .graveyard(card.name)
      .battlefield('Swamp', 'Forest')
      .at('precombatMain')
      .build();
    g.act(0).activate(card.name, { ability: 2, pay: true });
    g.passAll();
    expect(g.find({ name: card.name, zone: 'battlefield' })[0]?.tapped).toBe(true);
    g.expect.illegal(0, { activate: card.name, ability: 2 });
    g.expect.invariants();
  });

  test.each(['Grizzly Bears', 'Plains'])('Feral Appetite exiles %s and makes a Pest only for a creature', (target) => {
    const card = real('Feral Appetite');
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, 'Forest', 'Forest')
      .seat(1)
      .graveyard(target)
      .at('precombatMain')
      .build();
    g.act(0).activate(card.name, { pay: true, targets: [target] });
    g.passAll();
    g.expect.zone(target, 'exile', { seat: 1 });
    expect(g.find({ name: 'Pest', zone: 'battlefield' })).toHaveLength(target === 'Plains' ? 0 : 1);
    g.expect.invariants();
  });

  test('Pest Rescuer ignores nontoken Pests, creates only when absent, and increases the death life gain', () => {
    const card = real('Pest Rescuer');
    const pest = real("Teacher's Pest");
    const g = scenario()
      .define(card, pest)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(card.name, pest.name, 'Swamp', 'Swamp', 'Swamp')
      .hand('Murder')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(g.find({ name: 'Pest', zone: 'battlefield' })).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([]);
    g.advanceTo('precombatMain');
    g.act(0).cast('Murder', { pay: true, targets: ['Pest'] });
    g.passAll();
    g.passAll();
    g.expect.life(0, 42);
    g.expect.invariants();
  });

  test('Ribtruss Roaster devours and creates counted Pests with death abilities', () => {
    const card = real('Ribtruss Roaster');
    const mound = real('Blight Mound');
    const g = scenario()
      .define(card, mound)
      .seat(0)
      .library(...LIBRARY)
      .hand(card.name, 'Murder')
      .battlefield(mound.name, 'Grizzly Bears', 'Giant Spider')
      .battlefield('Forest', { count: 5 })
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('Grizzly Bears', 'Giant Spider');
    g.passAll();
    expect(g.find({ name: card.name, zone: 'battlefield' })[0]?.counters['+1/+1']).toBe(2);
    expect(g.find({ name: 'Pest', zone: 'battlefield' })).toHaveLength(2);
    g.advanceTo('end');
    g.passAll();
    expect(g.find({ name: 'Pest', zone: 'battlefield' })).toHaveLength(4);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).pass();
    g.act(0).cast('Murder', { pay: true, targets: [{ name: 'Pest', index: 3 }] });
    g.passAll();
    g.passAll();
    g.expect.life(0, 41);
    g.expect.invariants();
  });
});

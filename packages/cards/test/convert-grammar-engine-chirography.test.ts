// Intermediate Chirography (a Class of the Silverquill deck): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an
// engine scenario and is played through applyAction. Level 2 "Whenever you lose life for the first time each turn, put a +1/+1 counter on target creature you control."
// and level 3 "At the beginning of each end step, if a modified creature died under your control this turn, create a 2/1 ... Inkling creature token with flying."
// Pins: CR 119.3 (life loss), CR 603.2 (a trigger "for the first time each turn" counts the player's events), CR 603.4 (intervening if), CR 700.9 (modified),
// CR 700.4 (dies), CR 603.10a and 113.7a (a creature that died is read as it last was: its counters were on it), CR 716.2 (Class levels).
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

const CLASS = real('Intermediate Chirography');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(CLASS)).toEqual([]);
});

describe('level 2: the first time each turn you lose life, a +1/+1 counter on a creature you control', () => {
  const game = (level: number) =>
    scenario()
      .define(CLASS)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CLASS.name, { level })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .build();

  test('a loss of life puts one counter; a second loss in the same turn puts none', () => {
    const g = game(2);
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 34);
    g.expect.counters('bears', { '+1/+1': 1 });
  });

  test('two losses in one batch of combat damage are one first time: one counter', () => {
    const g = scenario()
      .define(CLASS)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CLASS.name, { level: 2 })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'a1' })
      .battlefield(BEARS, { label: 'a2' })
      .build();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1 });
    g.playCombat({ attack: ['a1', 'a2'] });
    g.expect.life(0, 36);
    g.expect.counters('bears', { '+1/+1': 1 });
  });

  test('at level 1 the ability is not there yet', () => {
    const g = game(1);
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
    g.expect.counters('bears', {});
  });

  test('the opponent losing life is not you losing life', () => {
    const g = game(2);
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.counters('bears', {});
  });

  test('the next turn it counts again', () => {
    const g = game(2);
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 2 });
  });
});

describe('level 3: at each end step, a modified creature of yours died this turn: an Inkling', () => {
  const inklings = (g: ReturnType<typeof setup>) =>
    g.find({ name: 'Inkling', zone: 'battlefield' }).length;

  const setup = (counters: boolean, level = 3) =>
    scenario()
      .define(CLASS)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CLASS.name, { level })
      .battlefield(
        BEARS,
        counters ? { label: 'bears', counters: { '+1/+1': 1 } } : { label: 'bears' },
      )
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .build();

  test('a creature with a counter dies: one Inkling at the end step', () => {
    const g = setup(true);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    expect(inklings(g)).toBe(1);
  });

  test('a creature with no modification dies: no Inkling', () => {
    const g = setup(false);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    expect(inklings(g)).toBe(0);
  });

  test('nothing died: no Inkling', () => {
    const g = setup(true);
    g.advanceTo('end');
    g.passAll();
    expect(inklings(g)).toBe(0);
  });

  test('at level 2 the ability is not there yet', () => {
    const g = setup(true, 2);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['bears'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(inklings(g)).toBe(0);
  });

  test("a modified creature of the opponent's that died is not one that died under your control", () => {
    const g = scenario()
      .define(CLASS)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CLASS.name, { level: 3 })
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs', counters: { '+1/+1': 1 } })
      .build();
    g.act(0).cast(MURDER, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.advanceTo('end');
    g.passAll();
    expect(inklings(g)).toBe(0);
  });
});

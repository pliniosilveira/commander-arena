// The Azula deck (issue 597): the REAL Oracle text of each card (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an
// engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
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

describe('Mystical Teachings: a search for an instant card or a card with flash (CR 701.23, 702.8a)', () => {
  const TEACHINGS = 'Mystical Teachings';
  const FLASHER = 'SYNTHETIC Thief Dragon';
  const teachings = real(TEACHINGS);

  const board = () =>
    scenario()
      .define(teachings)
      .define(syntheticCard(FLASHER))
      .seat(0)
      .library('Swamp', 'Grizzly Bears', FLASHER, 'Lightning Bolt', 'Swamp')
      .hand(TEACHINGS)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library('Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(teachings)).toEqual([]);
  });

  test('finds a card with flash or an instant, and nothing else', () => {
    for (const found of [FLASHER, 'Lightning Bolt']) {
      const g = board();
      g.act(0).cast(TEACHINGS, { pay: true });
      g.passAll();
      g.expect.pending('chooseCards', 0);
      g.act(0).chooseCards(g.id(found));
      g.expect.zone(found, 'hand', { seat: 0 });
      g.expect.eventLog(
        [
          { kind: 'librarySearched', seat: 0, found: 1 },
          { kind: 'libraryShuffled', seat: 0 },
        ],
        { since: 0 },
      );
      g.expect.invariants();
    }
  });

  test('a creature without flash is not offered', () => {
    const g = board();
    g.act(0).cast(TEACHINGS, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseCards(g.id('Grizzly Bears'))).toThrow();
  });
});

describe('Bulk Up: "Double target creature\'s power until end of turn" (CR 701.10)', () => {
  const BULK = 'Bulk Up';
  const bulk = real(BULK);

  const board = () =>
    scenario()
      .define(bulk)
      .seat(0)
      .hand(BULK)
      .battlefield('Mountain', 'Mountain', 'Grizzly Bears')
      .seat(1)
      .library('Swamp', 'Swamp')
      .battlefield('Llanowar Elves')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(bulk)).toEqual([]);
  });

  test('doubles the power of the target and leaves its toughness alone', () => {
    const g = board();
    g.act(0).cast(BULK, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.pt('Grizzly Bears', 4, 2);
    g.expect.pt('Llanowar Elves', 1, 1);
    g.expect.invariants();
  });

  test('it can be a creature an opponent controls', () => {
    const g = board();
    g.act(0).cast(BULK, { targets: ['Llanowar Elves'], pay: true });
    g.passAll();
    g.expect.pt('Llanowar Elves', 2, 1);
  });
});

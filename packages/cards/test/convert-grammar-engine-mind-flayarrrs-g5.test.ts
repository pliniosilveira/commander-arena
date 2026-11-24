// Mind Flayarrrs deck, group 5: the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction. Pins: CR 115.1 (the card is a target), CR 608.2g and 118.9 (cast without paying its mana cost as the effect resolves), CR 108.3 (a card goes to its owner's zone).
// Seats are driven by seat number, never by seat arithmetic: the tests run with 3 and 4 seats.
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
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Swamp');
const BOLT = 'Lightning Bolt';
const DIVINATION = 'Divination';
const BEARS = 'Grizzly Bears';

describe('Memory Plunder', () => {
  const plunder = real('Memory Plunder');
  const NAME = plunder.name;

  test('the card is valid and reads the free cast', () => {
    expect(validateCard(plunder)).toEqual([]);
    expect(JSON.stringify(plunder.faces[0])).toContain('"free":true');
  });

  /** Seat 0 holds the card and four Swamps; the other seats' graveyards are given (seat 0's own holds a Divination). */
  const board = (seats: 3 | 4, graveyards: readonly (readonly string[])[]) => {
    let b = scenario({ seats })
      .define(plunder)
      .seat(0)
      .library(...FILLER)
      .hand(NAME)
      .battlefield('Swamp', { count: 4 })
      .graveyard(DIVINATION);
    graveyards.forEach((yard, i) => {
      b = b
        .seat(i + 1)
        .library(...FILLER)
        .graveyard(...yard);
    });
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  for (const seats of [3, 4] as const) {
    test(`${seats} seats: a Bolt of an opponent's graveyard is cast for free by me and resolves; its owner keeps the card's zone`, () => {
      const g = board(seats, seats === 3 ? [[], [BOLT]] : [[], [], [BOLT]]);
      const owner = seats === 3 ? 2 : 3;
      g.act(0).cast(NAME, { targets: [{ name: BOLT, zone: 'graveyard', seat: owner }], pay: true });
      g.passAll();
      g.expect.pending('confirmOptional', 0);
      g.act(0).accept();
      g.act(0).chooseTargets({ player: 1 });
      // CR 608.2g: the Bolt is on the stack, cast without paying {R}, controlled by seat 0.
      g.expect.stack([BOLT]);
      g.passAll();
      g.expect.life(1, 37);
      g.expect.zone(BOLT, 'graveyard', { seat: owner });
      g.expect.invariants();
    });
  }

  test('my own graveyard is not a legal choice', () => {
    const g = board(3, [[BEARS], []]);
    expect(() =>
      g
        .act(0)
        .cast(NAME, { targets: [{ name: DIVINATION, zone: 'graveyard', seat: 0 }], pay: true }),
    ).toThrow();
  });

  test('a creature card of an opponent is not a legal choice', () => {
    const g = board(3, [[BEARS], []]);
    expect(() =>
      g.act(0).cast(NAME, { targets: [{ name: BEARS, zone: 'graveyard', seat: 1 }], pay: true }),
    ).toThrow();
  });

  test('declining leaves the card in the graveyard', () => {
    const g = board(3, [[BOLT], []]);
    g.act(0).cast(NAME, { targets: [{ name: BOLT, zone: 'graveyard', seat: 1 }], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.stack([]);
  });
});

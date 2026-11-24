// Mind Flayarrrs deck, group 5: the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction. Pins: CR 115.1 (the card is a target), CR 608.2g and 118.9 (cast without paying its mana cost as the effect resolves), CR 108.3 (a card goes to its owner's zone).
// Seats are driven by seat number, never by seat arithmetic: the tests run with 3 and 4 seats.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

describe("Captain N'ghathrod", () => {
  const captain = real("Captain N'ghathrod");
  const CAPTAIN = captain.name;
  const ANGEL = 'Serra Angel';
  const ELVES = 'Llanowar Elves';
  // SYNTHETIC helpers: one mills a target player, one makes a target player discard.
  const MILL = 'SYNTHETIC Mill Two';
  const mill = parsed(MILL, 'Sorcery', 'Target player mills two cards.');
  const DISCARD = 'SYNTHETIC Discard One';
  const discard = parsed(DISCARD, 'Sorcery', 'Target player discards a card.');
  const none = [] as string[];

  test('the card is valid', () => {
    expect(validateCard(captain)).toEqual([]);
  });

  /** Seat 0 has the Captain, four Islands and the given hand; the libraries (top first) and graveyards of every seat are given. */
  const board = (
    seats: 3 | 4,
    libraries: readonly (readonly string[])[],
    graveyards: readonly (readonly string[])[],
    hand: readonly string[] = [MILL],
    seatOneHand: readonly string[] = [],
  ) => {
    let b = scenario({ seats }).define(captain).define(mill).define(discard);
    for (let s = 0; s < seats; s++) {
      b = b
        .seat(s)
        .library(...(libraries[s] ?? []), ...FILLER)
        .graveyard(...(graveyards[s] ?? []));
      if (s === 0) {
        b = b
          .hand(...hand)
          .battlefield(CAPTAIN)
          .battlefield('Island', { count: 4 });
      }
      if (s === 1) b = b.hand(...seatOneHand);
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  for (const seats of [3, 4] as const) {
    const target = seats - 1;
    test(`${seats} seats: at my end step I take the creature card an opponent milled this turn, not one that was already in the graveyard`, () => {
      const libraries = Array.from({ length: seats }, () => none);
      libraries[target] = [ANGEL, ELVES];
      const graveyards = Array.from({ length: seats }, () => none);
      graveyards[target] = [BEARS];
      const g = board(seats, libraries, graveyards);
      g.act(0).cast(MILL, { targets: [{ player: target }], pay: true });
      g.passAll();
      g.expect.zone(ANGEL, 'graveyard', { seat: target });
      g.advanceTo('end');
      g.expect.pending('targets', 0);
      expect(() => g.act(0).chooseTargets(BEARS)).toThrow();
      g.act(0).chooseTargets(ANGEL);
      g.passAll();
      g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
      g.expect.zone(BEARS, 'graveyard', { seat: target });
      g.expect.zone(ELVES, 'graveyard', { seat: target });
      g.expect.invariants();
    });
  }

  test('a card that was in a graveyard before this turn is not a legal target', () => {
    const g = board(3, [none, none, none], [none, none, [BEARS]]);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
  });

  test('a card milled from my own library is not a legal target (an opponent’s graveyard only)', () => {
    const g = board(3, [[ANGEL, ELVES], none, none], [none, none, none]);
    g.act(0).cast(MILL, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
  });

  test('a discarded card is not "put there from their library"', () => {
    const g = board(3, [none, none, none], [none, none, none], [DISCARD], [ANGEL]);
    g.act(0).cast(DISCARD, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
  });

  test('a card that is neither an artifact nor a creature is not a legal target', () => {
    const g = board(3, [none, none, ['Island', 'Island']], [none, none, none]);
    g.act(0).cast(MILL, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Island', 'graveyard', { seat: 2 });
  });
});

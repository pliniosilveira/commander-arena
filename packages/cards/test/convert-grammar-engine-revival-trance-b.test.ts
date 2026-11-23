// The Revival Trance deck, group B: the REAL Oracle text of its cards (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is
// played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 201.2 (Name), CR 111.1 (Tokens), CR 406.1 (Exile).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly, spellCard } from './convert-grammar-helpers';

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
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const BEARS = 'Grizzly Bears';

describe('Legions to Ashes', () => {
  const legions = real('Legions to Ashes');
  const clues = parseOnly(
    spellCard('SYNTHETIC Clue Maker', 'Create two Clue tokens.', { manaCost: '{G}' }),
  ).definition;
  const foods = parseOnly(
    spellCard('SYNTHETIC Food Maker', 'Create two Food tokens.', { manaCost: '{G}' }),
  ).definition;

  /** Three seats: seat 1 has two Clues, two Foods and Grizzly Bears, seat 2 two Clues; seat 0 holds the real card. */
  const board = () => {
    const g = scenario({ seats: 3 })
      .define(legions)
      .define(clues)
      .define(foods)
      .seat(0)
      .hand(legions.name)
      .pool('CWB')
      .seat(1)
      .hand(clues.name, foods.name)
      .pool('GG')
      .battlefield(BEARS)
      .seat(2)
      .hand(clues.name)
      .pool('G')
      .at('precombatMain', { active: 0 })
      .build();
    for (const [seat, name] of [
      [1, clues.name],
      [1, foods.name],
      [2, clues.name],
    ] as const) {
      g.pass(0);
      if (seat === 2) g.pass(1);
      g.act(seat).cast(name, { pay: true });
      g.passAll();
    }
    return g;
  };

  test('a token target exiles every token with its name that its controller controls, not another player’s', () => {
    const g = board();
    g.act(0).cast(legions.name, { targets: [{ name: 'Clue', seat: 1, nth: 0 }], pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 1, count: 0 });
    g.expect.zone('Food', 'battlefield', { seat: 1, count: 2 });
    g.expect.zone('Clue', 'battlefield', { seat: 2, count: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('a nontoken target is exiled and no token goes with it', () => {
    const g = board();
    g.act(0).cast(legions.name, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone('Clue', 'battlefield', { seat: 1, count: 2 });
    g.expect.invariants();
  });
});

describe('Sepulchral Primordial', () => {
  const primordial = real('Sepulchral Primordial');
  const ELVES = 'Llanowar Elves';
  const ANGEL = 'Serra Angel';
  const LIBRARY = Array.from({ length: 12 }, () => 'Swamp');

  /** Seat 0 has the creature in hand and seven Swamps; seats 1 and 2 have the given cards in their graveyards. */
  const board = (one: readonly string[], two: readonly string[]) =>
    scenario({ seats: 3 })
      .define(primordial)
      .seat(0)
      .library(...LIBRARY)
      .hand(primordial.name)
      .battlefield('Swamp', { count: 7 })
      .seat(1)
      .library(...LIBRARY)
      .graveyard(...one)
      .seat(2)
      .library(...LIBRARY)
      .graveyard(...two)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const enter = (g: ReturnType<typeof board>) => {
    g.act(0).cast(primordial.name, { pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
  };

  test('one creature card from each opponent graveyard enters under my control, together', () => {
    const g = board([BEARS, ANGEL], [ELVES]);
    enter(g);
    g.act(0).chooseTargets(ANGEL, ELVES);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('up to one: a single target is enough, and declining puts nothing onto the battlefield', () => {
    const g = board([BEARS], [ELVES]);
    enter(g);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ELVES, 'graveyard', { seat: 2 });
    g.expect.invariants();
  });

  test('two cards of one opponent graveyard cannot both be chosen', () => {
    const g = board([BEARS, ANGEL], []);
    enter(g);
    expect(() => g.act(0).chooseTargets(BEARS, ANGEL)).toThrow();
  });
});

describe('Rejoin the Fight', () => {
  const rejoin = real('Rejoin the Fight');
  const ELVES = 'Llanowar Elves';
  const ANGEL = 'Serra Angel';

  /** Seat 0 has the sorcery in hand and the given library; 3 seats. */
  const board = (graveyard: readonly string[], library: readonly string[]) =>
    scenario({ seats: 3 })
      .define(rejoin)
      .seat(0)
      .library(...library)
      .hand(rejoin.name)
      .pool('BCCCCC')
      .graveyard(...graveyard)
      .seat(1)
      .seat(2)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('mills three, then the next opponent and the one after choose different creature cards, which enter under my control', () => {
    const g = board([BEARS], [ELVES, ANGEL, 'Swamp', 'Swamp', 'Swamp']);
    g.act(0).cast(rejoin.name, { pay: true });
    g.passAll();
    // Milled: Llanowar Elves, Serra Angel and a Swamp; the graveyard now holds three creature cards.
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards({ name: ANGEL, seat: 0 });
    g.expect.pending('chooseCards', 2);
    g.act(2).chooseCards({ name: BEARS, seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

// The Quandrix Unlimited deck, group E: the REAL Oracle text of Zimone, Infinite Analyst, Nev, the Practical Dean, Owlin Spiralmancer and Lattice Library (the corpus's golden.jsonl,
// taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for
// the real text are what the engine runs. The spells with an {X} in their mana cost are the engine's SYNTHETIC X spells (`synthetic-x.ts`). Pins: CR 107.3 (X in a mana cost),
// CR 601.2i and 603.2 (a cast trigger), CR 601.2f and 118.7a (a reduction of the cost), CR 707.10 (a copy of a spell is not cast).
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

const zimone = real('Zimone, Infinite Analyst');
const nev = real('Nev, the Practical Dean');
const owlin = real('Owlin Spiralmancer');
const library = real('Lattice Library');
const infiniscope = real('Brass Infiniscope');

const DRAW = 'SYNTHETIC X Draw'; // {X}{U}: draw X cards
const FIRST = `${DRAW}[0]`; // two are in hand: the first of them
const BOLT = 'Lightning Bolt'; // no {X}
const LIBRARY = Array.from({ length: 12 }, () => 'Forest');

test.each([zimone, nev, owlin, library, infiniscope])('$name is a valid card', (card) => {
  expect(validateCard(card)).toEqual([]);
});

describe('Nev, the Practical Dean: X counters for the first spell with {X} each turn', () => {
  const board = () =>
    scenario()
      .define(nev)
      .seat(0)
      .library(...LIBRARY)
      .hand(DRAW, DRAW, BOLT)
      .battlefield(nev.name, { label: 'nev' })
      .battlefield('Island', { count: 8 })
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the X of the spell that was cast is the number of counters (CR 107.3)', () => {
    const g = board();
    g.act(0).cast(FIRST).x(3).pay();
    g.expect.stack([`${nev.name} (ability)`, DRAW]);
    g.passAll();
    g.expect.counters('nev', { '+1/+1': 3 });
    g.expect.invariants();
  });

  test('only the first spell with {X} each turn triggers it, and a spell with no {X} is not one', () => {
    const g = board();
    g.act(0)
      .cast(BOLT, { targets: [{ player: 1 }] })
      .pay();
    g.expect.stack([BOLT]);
    g.passAll();
    g.act(0).cast(FIRST).x(2).pay();
    g.expect.stack([`${nev.name} (ability)`, DRAW]);
    g.passAll();
    g.act(0).cast(FIRST).x(4).pay();
    g.expect.stack([DRAW]);
    g.passAll();
    g.expect.counters('nev', { '+1/+1': 2 });
  });

  test('X = 0 puts no counters', () => {
    const g = board();
    g.act(0).cast(FIRST).x(0).pay();
    g.passAll();
    g.expect.counters('nev', {});
  });
});

describe('Zimone, Infinite Analyst', () => {
  const board = (counters: number) =>
    scenario()
      .define(zimone)
      .seat(0)
      .library(...LIBRARY)
      .hand(DRAW, DRAW)
      .battlefield(zimone.name, { label: 'zimone', counters: { '+1/+1': counters } })
      .battlefield('Island', { count: 8 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the first spell with {X} each turn costs {1} less for each +1/+1 counter (CR 601.2f)', () => {
    const g = board(2);
    g.act(0).cast(FIRST).x(5);
    expect(g.state.casting?.totalCost).toEqual(['3', 'U']);
  });

  test('it never takes the colored mana off, nor more than the generic mana', () => {
    const g = board(7);
    g.act(0).cast(FIRST).x(5);
    expect(g.state.casting?.totalCost).toEqual(['U']);
  });

  test('two counters are put on it for the first such spell, and the second spell pays in full', () => {
    const g = board(1);
    g.act(0).cast(FIRST).x(2).pay();
    g.expect.stack([`${zimone.name} (ability)`, DRAW]);
    g.passAll();
    g.expect.counters('zimone', { '+1/+1': 3 });
    g.act(0).cast(FIRST).x(5);
    expect(g.state.casting?.totalCost).toEqual(['5', 'U']);
    g.act(0).payAuto();
    g.expect.stack([DRAW]);
    g.passAll();
    g.expect.counters('zimone', { '+1/+1': 3 });
    g.expect.invariants();
  });
});

describe('Owlin Spiralmancer: copy the first spell with {X} each turn', () => {
  const board = () =>
    scenario()
      .define(owlin)
      .seat(0)
      .library(...LIBRARY)
      .hand(DRAW, DRAW)
      .battlefield(owlin.name)
      .battlefield('Island', { count: 8 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('accepting copies the spell with its X (CR 707.10); the copy is not cast', () => {
    const g = board();
    g.act(0).cast(FIRST).x(2).pay();
    g.expect.stack([`${owlin.name} (ability)`, DRAW]);
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.handSize(0, 5);
    g.expect.invariants();
  });

  test('declining copies nothing', () => {
    const g = board();
    g.act(0).cast(FIRST).x(2).pay();
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.handSize(0, 3);
  });

  test('the second spell with {X} of the turn is not copied (the copy was not cast either)', () => {
    const g = board();
    g.act(0).cast(FIRST).x(1).pay();
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.act(0).cast(FIRST).x(1).pay();
    g.expect.stack([DRAW]);
  });
});

describe('Lattice Library: a Fractal for each first spell with {X} each turn', () => {
  test('it enters with X study counters and makes a Fractal with that many counters', () => {
    const g = scenario()
      .define(library)
      .seat(0)
      .library(...LIBRARY)
      .hand(library.name)
      .battlefield('Forest', { count: 6 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(library.name).x(3).pay();
    g.passAll();
    g.expect.counters(library.name, { study: 3 });
    const fractal = g.find({ name: 'Fractal', zone: 'battlefield', seat: 0 });
    expect(fractal).toHaveLength(1);
    g.expect.pt('Fractal', 3, 3);
    g.expect.invariants();
  });

  test('the cast trigger makes another one, with as many counters as there are study counters', () => {
    const g = scenario()
      .define(library)
      .seat(0)
      .library(...LIBRARY)
      .hand(DRAW, DRAW)
      .battlefield(library.name, { counters: { study: 2 } })
      .battlefield('Island', { count: 8 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(FIRST).x(1).pay();
    g.expect.stack([`${library.name} (ability)`, DRAW]);
    g.passAll();
    expect(g.find({ name: 'Fractal', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.pt('Fractal', 2, 2);
    g.act(0).cast(FIRST).x(1).pay();
    g.expect.stack([DRAW]);
    g.passAll();
    expect(g.find({ name: 'Fractal', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.counters(library.name, { study: 2 });
  });
});

describe('Brass Infiniscope: the next spell with {X} this turn draws a card and gains half X life', () => {
  const board = () =>
    scenario()
      .define(infiniscope)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, DRAW, DRAW)
      .battlefield(infiniscope.name)
      .battlefield('Island', { count: 6 })
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('it adds {C}{C} and the delayed trigger fires on the next spell with {X} (CR 603.7)', () => {
    const g = board();
    g.act(0).tapForMana(infiniscope.name);
    g.expect.pool(0, { C: 2 });
    g.act(0).cast(FIRST).x(5).pay();
    // The draw spell draws five; the trigger draws one more and gains 2 life (half of 5, rounded down).
    g.expect.stack([`${infiniscope.name} (ability)`, DRAW]);
    g.passAll();
    g.expect.life(0, 42);
    g.expect.handSize(0, 1 + 1 + 5 + 1);
    g.expect.invariants();
  });

  test('a spell with no {X} does not use it up, and it fires once only', () => {
    const g = board();
    g.act(0).tapForMana(infiniscope.name);
    g.act(0)
      .cast(BOLT, { targets: [{ player: 1 }] })
      .pay();
    g.expect.stack([BOLT]);
    g.passAll();
    g.act(0).cast(FIRST).x(1).pay();
    g.passAll();
    g.expect.life(0, 40);
    g.act(0).cast(FIRST).x(1).pay();
    g.expect.stack([DRAW]);
  });

  test('the trigger is delayed: nothing waits before the mana ability is used', () => {
    const g = board();
    expect(g.state.delayedTriggers).toHaveLength(0);
    g.act(0).tapForMana(infiniscope.name);
    expect(g.state.delayedTriggers).toHaveLength(1);
    expect(g.state.delayedTriggers[0]?.untilEndOfTurn).toBe(true);
  });
});

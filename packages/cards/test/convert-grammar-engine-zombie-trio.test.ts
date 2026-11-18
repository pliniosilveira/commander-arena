// Dread Summons, Forgotten Creation and Liliana, Death's Majesty (issue 104): the REAL Oracle text of the cards (golden.jsonl, taken from the issue)
// goes through the grammar with no override and is played through applyAction, so the nodes the parser writes are what the engine runs.
// Pins: CR 701.17a (Mill), CR 701.9 (Discard), CR 608.2c (what an earlier instruction did: "this way", "that many", "if you do"),
// CR 611.2a and 611.2c (a continuous effect from a resolving spell or ability), CR 205.1b, 105.3, 613.1d, 613.1e (the added types and colors).
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

const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 8 }, () => 'Plains');

describe('Dread Summons: "Each player mills X cards. For each creature card put into a graveyard this way, you create a tapped 2/2 black Zombie creature token."', () => {
  const summons = real('Dread Summons');
  const start = (mine: readonly string[], theirs: readonly string[]) =>
    scenario()
      .define(summons)
      .seat(0)
      .library(...mine, ...FILLER)
      .hand(summons.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...theirs, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  const zombies = (g: ReturnType<typeof start>) =>
    g.state.battlefield
      .map((id) => g.state.objects[id])
      .filter((o) => o?.token?.characteristics.name === 'Zombie' && o.controller === 0);

  test('the card is valid', () => {
    expect(validateCard(summons)).toEqual([]);
  });

  test('creature cards of both players count; a tapped Zombie for each, a land card gives none', () => {
    const g = start([BEARS, 'Plains', BEARS], [BEARS, BEARS, 'Plains']);
    g.act(0).cast(summons.name).x(3).pay();
    g.passAll();
    // Three cards each: seat 0 milled 2 creatures, seat 1 milled 2 creatures.
    g.expect.librarySize(0, FILLER.length);
    expect(zombies(g)).toHaveLength(4);
    expect(zombies(g).every((z) => z?.tapped === true)).toBe(true);
    g.expect.invariants();
  });

  test('no creature card milled: no token; X = 0 mills nothing', () => {
    const g = start(['Plains', 'Plains'], ['Plains', 'Plains']);
    g.act(0).cast(summons.name).x(2).pay();
    g.passAll();
    expect(zombies(g)).toHaveLength(0);
    const h = start([BEARS], [BEARS]);
    h.act(0).cast(summons.name).x(0).pay();
    h.passAll();
    expect(zombies(h)).toHaveLength(0);
  });

  test('a library shorter than X mills what it has and only those cards count', () => {
    const g = scenario()
      .define(summons)
      .seat(0)
      .library(BEARS)
      .hand(summons.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(summons.name).x(3).pay();
    g.passAll();
    expect(zombies(g)).toHaveLength(1);
  });
});

describe('Forgotten Creation: "At the beginning of your upkeep, you may discard all the cards in your hand. If you do, draw that many cards."', () => {
  const creation = real('Forgotten Creation');
  const start = (hand: readonly string[]) =>
    scenario()
      .define(creation)
      .seat(0)
      .library('Island', 'Swamp', 'Plains', 'Forest', 'Mountain', 'Island', 'Swamp', 'Plains')
      .hand(...hand)
      .battlefield(creation.name)
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 1, turn: 2 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(creation)).toEqual([]);
  });

  test('accepted: the whole hand is discarded and that many cards are drawn', () => {
    const g = start([BEARS, 'Plains', 'Island']);
    g.advanceTo('upkeep');
    g.passAll();
    g.act(0).accept();
    g.expect.zone(BEARS, 'graveyard');
    g.expect.handSize(0, 3);
  });

  test('declined: nothing is discarded or drawn', () => {
    const g = start([BEARS, 'Plains', 'Island']);
    g.advanceTo('upkeep');
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'hand');
    g.expect.handSize(0, 3);
  });

  test('accepted with an empty hand: nothing is drawn', () => {
    const g = start([]);
    g.advanceTo('upkeep');
    g.passAll();
    g.act(0).accept();
    g.expect.handSize(0, 0);
  });
});

describe("Liliana, Death's Majesty", () => {
  const liliana = real("Liliana, Death's Majesty");
  const start = (graveyard: readonly string[]) =>
    scenario()
      .define(liliana)
      .seat(0)
      .library(...FILLER)
      .graveyard(...graveyard)
      .battlefield(liliana.name)
      .seat(1)
      .library(...FILLER)
      .battlefield('Llanowar Elves')
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(liliana)).toEqual([]);
  });

  test('-3: the creature card returns as a black Zombie in addition to its other colors and types, for good', () => {
    const g = start([BEARS]);
    g.act(0).activate(liliana.name, { ability: 1, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.derived(BEARS, { colors: ['G', 'B'], subtypes: ['Bear', 'Zombie'] });
    // CR 611.2a: no duration, so it lasts as long as the permanent stays: past the end of the turn.
    g.advanceTo('end');
    g.advanceTo('upkeep');
    g.expect.derived(BEARS, { colors: ['G', 'B'], subtypes: ['Bear', 'Zombie'] });
  });

  test('+1: a 2/2 Zombie token and two cards milled', () => {
    const g = start([]);
    g.act(0).activate(liliana.name, { ability: 0 });
    g.passAll();
    g.expect.librarySize(0, FILLER.length - 2);
    g.expect.counters(liliana.name, { loyalty: 6 });
    const token = g.state.battlefield
      .map((id) => g.state.objects[id])
      .find((o) => o?.token?.characteristics.name === 'Zombie');
    expect(token).toBeDefined();
  });

  test('-7: destroys every non-Zombie creature', () => {
    const g = scenario()
      .define(liliana)
      .seat(0)
      .library(...FILLER)
      .battlefield(liliana.name, { counters: { loyalty: 7 } })
      .seat(1)
      .library(...FILLER)
      .battlefield('Llanowar Elves')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(liliana.name, { ability: 2 });
    g.passAll();
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
  });
});

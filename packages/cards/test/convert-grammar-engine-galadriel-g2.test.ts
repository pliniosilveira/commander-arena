// The Galadriel deck (issue 43), group 2 (D-1610 to D-1618): the REAL Oracle text of Hobbit Hole, Multani, Yavimaya's Avatar, Ashaya, Soul of the Wild, Thranduil, Sindarin Liege // Silvan Rally and
// Bonny Pall, Clearcutter (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction, so the nodes the parser writes for the real text are what the engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling of the engine fixtures
// (`synthetic-galadriel-g2.ts`), which the engine tests and the AI soak play. Pins: CR 613.1d and 205.1b (layer 4), CR 305.6 (the mana ability of a basic land type), CR 208.2a and 604.3
// (a characteristic-defining ability), CR 602.2 (a cost paid where the ability works), CR 608.2d ("up to"), CR 702.29e (typecycling).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const hole = real('Hobbit Hole');
const multani = real("Multani, Yavimaya's Avatar");
const ashaya = real('Ashaya, Soul of the Wild');
const thranduil = real('Thranduil, Sindarin Liege // Silvan Rally');
const bonny = real('Bonny Pall, Clearcutter');

/** The token of an enters trigger with the name and the words the SYNTHETIC sibling gives it (the real ones are the card's own). */
function renamed<T>(value: T, from: [string, string], to: [string, string]): T {
  return JSON.parse(
    JSON.stringify(value).split(from[0]).join(to[0]).split(from[1]).join(to[1]),
  ) as T;
}

describe('every card is valid and has the AST of its SYNTHETIC sibling', () => {
  test.each([
    ['Hobbit Hole', hole, 'SYNTHETIC Halfling Hole'],
    ["Multani, Yavimaya's Avatar", multani, 'SYNTHETIC Land Avatar'],
    ['Ashaya, Soul of the Wild', ashaya, 'SYNTHETIC Forest Heart'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    const twin = syntheticCard(sibling).faces[0];
    // The first ability of Hobbit Hole (a search for a basic land) is not part of the sibling.
    const own = card === hole ? card.faces[0]?.abilities.slice(1) : card.faces[0]?.abilities;
    expect(own).toEqual(twin?.abilities);
  });

  test('Silvan Rally, the Adventure of Thranduil', () => {
    expect(validateCard(thranduil)).toEqual([]);
    expect(thranduil.faces[1]?.spell).toEqual(
      syntheticCard('SYNTHETIC Mill Four Take Two').faces[0]?.spell,
    );
  });

  test('Bonny Pall, with the token named as the sibling names it', () => {
    expect(validateCard(bonny)).toEqual([]);
    const twin = syntheticCard('SYNTHETIC Land Giant').faces[0];
    expect(
      renamed(
        bonny.faces[0]?.abilities,
        ['Beau', 'Beau'],
        ['SYNTHETIC Ox Token', 'SYNTHETIC Ox Token'],
      ),
    ).toEqual(twin?.abilities);
  });
});

const LIB = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

describe('Ashaya, Soul of the Wild (real text)', () => {
  test('her power and toughness count the lands, and a nontoken creature of hers is a Forest land that taps for {G}', () => {
    const g = scenario()
      .define(ashaya)
      .seat(0)
      .library(...LIB)
      .battlefield(ashaya.name)
      .battlefield('Grizzly Bears')
      .battlefield('Mountain')
      .seat(1)
      .library(...LIB)
      .battlefield('Giant Spider')
      .at('precombatMain')
      .build();
    // Ashaya, Grizzly Bears and the Mountain.
    g.expect.pt(ashaya.name, 3, 3);
    g.expect.derived('Grizzly Bears', {
      types: ['creature', 'land'],
      subtypes: ['Bear', 'Forest'],
    });
    g.expect.derived('Giant Spider', { types: ['creature'], subtypes: ['Spider'] });
    g.act(0).tapForMana('Grizzly Bears');
    g.expect.pool(0, 'G');
  });
});

describe("Multani, Yavimaya's Avatar (real text)", () => {
  test('+1/+1 for each land and each land card in the graveyard; it comes back for two lands', () => {
    const g = scenario()
      .define(multani)
      .seat(0)
      .library(...LIB)
      .battlefield(multani.name)
      .battlefield('Forest', { count: 3 })
      .graveyard('Island')
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    g.expect.pt(multani.name, 4, 4);
    const back = scenario()
      .define(multani)
      .seat(0)
      .library(...LIB)
      .graveyard(multani.name)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    back.act(0).activate(multani.name, { pay: true });
    back.act(0).choosePermanents('Forest[0]', 'Forest[1]');
    back.passAll();
    back.expect.zone(multani.name, 'hand', { seat: 0 });
    back.expect.zone('Forest', 'hand', { seat: 0, count: 2 });
    back.expect.invariants();
  });
});

describe('Silvan Rally (real text)', () => {
  test('mills four and puts up to two of the lands milled into the hand', () => {
    const g = scenario()
      .define(thranduil)
      .seat(0)
      .library('Island', 'Forest', 'Grizzly Bears', 'Mountain', 'Plains', 'Plains')
      .hand(thranduil.name)
      .pool('GUC')
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    g.act(0).cast(thranduil.name, { face: 1, pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Island', 'Mountain');
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.zone('Mountain', 'hand', { seat: 0 });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Bonny Pall, Clearcutter (real text)', () => {
  test('Beau is as big as the lands, and an attack draws a card and puts a land from the graveyard onto the battlefield', () => {
    const g = scenario()
      .define(bonny)
      .seat(0)
      .library(...LIB)
      .hand(bonny.name)
      .battlefield('Island', { count: 3 })
      .battlefield('Forest', { count: 3 })
      .graveyard('Swamp')
      .battlefield('Grizzly Bears')
      .pool('GUU')
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    g.act(0).cast(bonny.name, { pay: true });
    g.passAll();
    g.expect.pt('Beau', 6, 6);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['Grizzly Bears']);
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: 'Swamp', zone: 'graveyard' });
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    // Seven lands now.
    g.expect.pt('Beau', 7, 7);
    g.expect.invariants();
  });
});

describe('Hobbit Hole (real text)', () => {
  test('Halflingcycling {4}: discard it and find a card of the Halfling type (the sibling creature is one)', () => {
    const g = scenario()
      .define(hole)
      .seat(0)
      .library('Grizzly Bears', 'SYNTHETIC Halfling Scout', 'Island')
      .hand(hole.name)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    g.act(0).activate(hole.name, { ability: 2, pay: true });
    g.expect.zone(hole.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('SYNTHETIC Halfling Scout');
    g.expect.zone('SYNTHETIC Halfling Scout', 'hand', { seat: 0 });
    g.expect.invariants();
  });
});

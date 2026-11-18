// Issue 104 (CR 608.2c, 608.2d, 707.2, 707.9b): the REAL Oracle text of God-Pharaoh's Gift and The Scarab God (the Scryfall data of the deck support issue, in the golden corpus) goes through
// the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Helper cards are real fixtures.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the test data`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 14 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';

const gift = real("God-Pharaoh's Gift");
const scarab = real('The Scarab God');
const GIFT = gift.name;
const SCARAB = scarab.name;

describe('the real cards are valid', () => {
  test.each([gift, scarab])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe("God-Pharaoh's Gift", () => {
  const start = (graveyard: readonly string[] = [BEARS, ELVES]) =>
    scenario()
      .define(gift)
      .seat(0)
      .graveyard(...graveyard)
      .battlefield(GIFT)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('at the beginning of combat the chosen creature card is exiled and a 4/4 black Zombie copy with haste is created', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    const token = g.find({ name: BEARS, zone: 'battlefield', seat: 0 });
    expect(token).toHaveLength(1);
    expect(token[0]?.token).not.toBeNull();
    g.expect.pt({ name: BEARS, zone: 'battlefield', seat: 0 }, 4, 4);
    g.expect.derived(
      { name: BEARS, zone: 'battlefield', seat: 0 },
      { subtypes: ['Zombie'], colors: ['B'], keywords: ['haste'] },
    );
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEARS)?.isToken).toBe(true);
  });

  test('declining the offer leaves the card and makes no token', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(0);
  });

  test('with no creature card in the graveyard nothing happens', () => {
    const g = start([]);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(getView(g.state, 0).battlefield).toHaveLength(1);
  });
});

describe('The Scarab God', () => {
  const start = () =>
    scenario()
      .define(scarab)
      .seat(0)
      .battlefield(SCARAB, 'Island', 'Island', 'Swamp', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .graveyard(ELVES)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('{2}{U}{B}: the creature card of a graveyard is exiled and a 4/4 black Zombie copy of it is created', () => {
    const g = start();
    g.act(0).activate(SCARAB, {
      pay: true,
      targets: [{ name: ELVES, zone: 'graveyard', seat: 1 }],
    });
    g.passAll();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    expect(g.find({ name: ELVES, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.pt({ name: ELVES, zone: 'battlefield', seat: 0 }, 4, 4);
    g.expect.derived(
      { name: ELVES, zone: 'battlefield', seat: 0 },
      { subtypes: ['Zombie'], colors: ['B'] },
    );
  });

  test('at the beginning of your upkeep each opponent loses X life, X being the Zombies you control (the God is no Zombie, the token is)', () => {
    const g = start();
    g.act(0).activate(SCARAB, {
      pay: true,
      targets: [{ name: ELVES, zone: 'graveyard', seat: 1 }],
    });
    g.passAll();
    g.expect.life(1, 40);
    // The opponent's turn is next; the upkeep of the turn after it is ours: the token is the one Zombie (the God itself is only a God), so the opponent loses 1 and the scry of 1 is asked.
    g.advanceTo('upkeep', { turn: 5 });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.pending('arrangeCards', 0);
  });
});

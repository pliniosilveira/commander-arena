// The Squirreled Away deck, group 1: the REAL Oracle text of Academy Manufactor, Chatterfang, Squirrel General, Moonstone Eulogist and Nadier's Nightblade (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the
// nodes the parser writes for the real text are what the engine runs. Pins: CR 614.1a and 614.5 (replacement effects of the creation of tokens, each applying once),
// CR 616.1 (the order is asked when it matters), CR 111.10 (Clue, Food, Treasure and Blood), CR 603.6c and 603.10a (leaves the battlefield). The helper cards are old
// fixtures and SYNTHETIC cards.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const CLUE_SPELL = 'SYNTHETIC Clue Spell'; // {1}: a Clue token
const TREASURES = 'SYNTHETIC Treasure Pair'; // {1}{R}: two Treasure tokens
const MUSTER = 'SYNTHETIC Muster Call'; // {1}{W}: two tapped Soldier tokens

const count = (g: ScenarioGame, name: string, seat: 0 | 1 | 2 = 0): number =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return o?.token?.characteristics.name === name && o.controller === seat;
  }).length;

describe('Academy Manufactor: "If you would create a Clue, Food, or Treasure token, instead create one of each."', () => {
  const manufactor = real('Academy Manufactor');

  test('the card is valid', () => {
    expect(validateCard(manufactor)).toEqual([]);
  });

  test('two Treasures become two Clues, two Foods and two Treasures', () => {
    const g = scenario()
      .define(manufactor)
      .seat(0)
      .hand(TREASURES)
      .battlefield(manufactor.name, 'Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(TREASURES, { pay: true });
    g.passAll();
    expect([count(g, 'Clue'), count(g, 'Food'), count(g, 'Treasure')]).toEqual([2, 2, 2]);
    g.expect.invariants();
  });
});

describe('Chatterfang: "If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead."', () => {
  const chatterfang = real('Chatterfang, Squirrel General');

  test('the card is valid', () => {
    expect(validateCard(chatterfang)).toEqual([]);
  });

  test('two Soldiers come with two Squirrels', () => {
    const g = scenario()
      .define(chatterfang)
      .seat(0)
      .hand(MUSTER)
      .battlefield(chatterfang.name, 'Plains', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(MUSTER, { pay: true });
    g.passAll();
    expect([count(g, 'Soldier'), count(g, 'Squirrel')]).toEqual([2, 2]);
    g.expect.invariants();
  });

  test('with Academy Manufactor: the order is asked, and each answer is honoured', () => {
    const manufactor = real('Academy Manufactor');
    const make = (first: 'manufactor' | 'chatterfang') => {
      const g = scenario()
        .define(chatterfang)
        .define(manufactor)
        .seat(0)
        .hand(CLUE_SPELL)
        .battlefield(chatterfang.name, manufactor.name, 'Plains', 'Mountain')
        .seat(1)
        .library(...FILLER)
        .build();
      g.act(0).cast(CLUE_SPELL, { pay: true });
      g.passAll();
      const d = g.state.pending;
      if (d?.kind !== 'chooseOption' || d.replacement?.tokens === undefined) {
        throw new Error(`expected the replacement question, got ${d?.kind}`);
      }
      const pick = d.replacement.choices.find((c) =>
        first === 'manufactor' ? c.text.startsWith('Create one of each') : /Squirrel/.test(c.text),
      );
      g.act(0).chooseOption(pick?.option ?? '');
      g.passAll();
      return g;
    };
    const manufactorFirst = make('manufactor');
    expect([
      count(manufactorFirst, 'Clue'),
      count(manufactorFirst, 'Food'),
      count(manufactorFirst, 'Treasure'),
      count(manufactorFirst, 'Squirrel'),
    ]).toEqual([1, 1, 1, 3]);
    const chatterfangFirst = make('chatterfang');
    expect([
      count(chatterfangFirst, 'Clue'),
      count(chatterfangFirst, 'Food'),
      count(chatterfangFirst, 'Treasure'),
      count(chatterfangFirst, 'Squirrel'),
    ]).toEqual([1, 1, 1, 1]);
  });
});

describe('Moonstone Eulogist: "Whenever a creature an opponent controls dies, you create a Blood token."', () => {
  const eulogist = real('Moonstone Eulogist');

  test('the card is valid', () => {
    expect(validateCard(eulogist)).toEqual([]);
  });

  test("a creature of any opponent dies: its watcher's controller creates a Blood token", () => {
    const g = scenario({ seats: 3 })
      .define(eulogist)
      .seat(0)
      .hand('Murder')
      .battlefield(eulogist.name, 'Swamp', 'Swamp', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .battlefield('Grizzly Bears')
      .library(...FILLER)
      .build();
    g.act(0).cast('Murder', { pay: true, targets: ['Grizzly Bears'] });
    g.passAll();
    expect(count(g, 'Blood')).toBe(1);
    g.expect.derived(
      { name: 'Blood', zone: 'battlefield', nth: 0 },
      { types: ['artifact'], subtypes: ['Blood'] },
    );
  });
});

describe('Nadier\'s Nightblade: "Whenever a token you control leaves the battlefield, each opponent loses 1 life and you gain 1 life."', () => {
  const nightblade = real("Nadier's Nightblade");

  test('the card is valid', () => {
    expect(validateCard(nightblade)).toEqual([]);
  });

  test('a Treasure sacrificed for mana drains every opponent', () => {
    const g = scenario({ seats: 3 })
      .define(nightblade)
      .seat(0)
      .hand(TREASURES)
      .battlefield(nightblade.name, 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .build();
    g.act(0).cast(TREASURES, { pay: true });
    g.passAll();
    const before = g.state.seats.map((s) => s.life);
    g.act(0).tapForMana({ name: 'Treasure', zone: 'battlefield', nth: 0 }, { color: 'R' });
    g.passAll();
    expect(g.state.seats.map((s) => s.life)).toEqual([
      (before[0] ?? 0) + 1,
      (before[1] ?? 0) - 1,
      (before[2] ?? 0) - 1,
    ]);
  });
});

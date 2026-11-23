// "The number of colors among permanents you control" (the Dance of the Elements deck): the REAL Oracle text of Elemental Spectacle, Shimmercreep and Faeburrow Elder (the corpus's
// golden.jsonl) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the
// real text are what the engine runs. CR 105.2 (a color counts once, colorless is no color), CR 608.2c (read as the instruction runs), CR 605.3b (a mana ability resolves at once).
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

const BEARS = 'Grizzly Bears'; // green
const ANGEL = 'Serra Angel'; // white
const GOBLIN = 'Raging Goblin'; // red
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

const spectacle = real('Elemental Spectacle');
const shimmercreep = real('Shimmercreep');
const elder = real('Faeburrow Elder');

test.each([spectacle, shimmercreep, elder])('$name is a valid card', (card) => {
  expect(validateCard(card)).toEqual([]);
});

describe('Elemental Spectacle: a token for each color, then life for each creature', () => {
  const play = (permanents: readonly string[]) => {
    const g = scenario()
      .define(spectacle)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(spectacle.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', ...permanents)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(spectacle.name, { pay: true });
    g.passAll();
    return g;
  };

  test('two colors among the permanents: two 5/5 red and green Elementals, then 4 life for 4 creatures', () => {
    const g = play([BEARS, ANGEL]);
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 2 });
    g.expect.derived('Elemental[0]', { colors: ['R', 'G'], subtypes: ['Elemental'] });
    g.expect.pt('Elemental[0]', 5, 5);
    g.expect.life(0, 24);
    g.expect.invariants();
  });

  test('only lands: no color, so no token, and no creature to gain life for', () => {
    const g = play([]);
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 0 });
    g.expect.life(0, 20);
  });
});

describe('Shimmercreep: each opponent loses X and you gain X, X the colors among permanents you control', () => {
  const play = (mine: readonly string[], theirs: readonly string[] = []) => {
    const g = scenario()
      .define(shimmercreep)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(shimmercreep.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', ...mine)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(shimmercreep.name, { pay: true });
    g.passAll();
    return g;
  };

  test('read as the ability resolves, Shimmercreep itself counts: black alone is 1', () => {
    const g = play([]);
    g.expect.life(1, 19);
    g.expect.life(0, 21);
  });

  test('black, green and white: 3, each color once', () => {
    const g = play([BEARS, ANGEL, 'Llanowar Elves']);
    g.expect.life(1, 17);
    g.expect.life(0, 23);
  });

  test("an opponent's permanents are not counted", () => {
    const g = play([], [GOBLIN, ANGEL]);
    g.expect.life(1, 19);
    g.expect.life(0, 21);
  });
});

describe('Faeburrow Elder: +1/+1 and one mana for each color among permanents you control', () => {
  const base = (permanents: readonly string[]) =>
    scenario()
      .define(elder)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(elder.name, ...permanents)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('green and white alone: 2/2, and {G}{W} when tapped', () => {
    const g = base([]);
    g.expect.pt(elder.name, 2, 2);
    g.act(0).tapForMana(elder.name);
    g.expect.pool(0, 'GW');
    g.expect.tapped(elder.name, true);
  });

  test('a red creature adds a third color: 3/3, and {R}{G}{W}; a second green one adds none', () => {
    const g = base([GOBLIN, BEARS, 'Llanowar Elves']);
    g.expect.pt(elder.name, 3, 3);
    g.act(0).tapForMana(elder.name);
    g.expect.pool(0, 'RGW');
  });

  test('colorless lands add no mana and no color', () => {
    const g = base(['Plains', 'Forest']);
    g.act(0).tapForMana(elder.name);
    g.expect.pool(0, 'GW');
  });
});

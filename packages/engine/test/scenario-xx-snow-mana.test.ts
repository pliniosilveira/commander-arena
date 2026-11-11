// "You gain 1 life for each {S} spent to cast this spell" and a search for "a snow permanent card, a legendary card, or a Saga card" (D-260, the Bruna deck).
// Pins: CR 107.4h (the {S} symbol also refers to mana of any type produced by a snow source that was spent to pay a cost), CR 205.4g (a snow permanent), CR 601.2h (the
// total cost is paid with mana; what was spent is a fact about the spell), CR 701.23a-b (search: the cards that match, finding fewer is allowed), CR 701.20 (reveal),
// CR 707.10 (a copy of a spell is not cast: no mana was spent on it). Cards are SYNTHETIC (src/cards/fixtures/synthetic-snow.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const QUEST = 'SYNTHETIC Frozen Quest'; // {2}{W} snow sorcery: the search, then 1 life for each {S} spent
const SNOW_PLAINS = 'SYNTHETIC Snow Plains';
const SPRITE = 'SYNTHETIC Snow Sprite'; // a snow creature
const FLURRY = 'SYNTHETIC Snow Flurry'; // a snow instant: no snow permanent
const LEGEND = 'SYNTHETIC Legend of Frost'; // a legendary creature
const SAGA = 'SYNTHETIC Brief Tale'; // a Saga

describe('the cards are valid', () => {
  test.each([QUEST, SNOW_PLAINS, SPRITE, FLURRY, LEGEND])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const game = (lands: readonly string[], library: readonly string[] = ['Plains']) =>
  scenario()
    .seat(0)
    .hand(QUEST)
    .battlefield(...lands)
    .library(...library)
    .seat(1)
    .library('Plains')
    .build();

/** Cast the spell, let it resolve, and answer the search with nothing, so the life gained stands alone. */
const castAndFind = (g: ScenarioGame): void => {
  g.act(0).cast(QUEST, { pay: true });
  g.passAll();
};

describe('"You gain 1 life for each {S} spent to cast this spell"', () => {
  test('three snow lands pay for it: 3 life', () => {
    const g = game([SNOW_PLAINS, SNOW_PLAINS, SNOW_PLAINS]);
    castAndFind(g);
    g.expect.life(0, 43);
    g.expect.invariants();
  });

  test('only the mana of snow sources counts: two snow lands and one that is not snow, 2 life', () => {
    const g = game([SNOW_PLAINS, SNOW_PLAINS, 'Plains']);
    castAndFind(g);
    g.expect.life(0, 42);
  });

  test('no snow mana, no life: the spell still searches', () => {
    const g = game(['Plains', 'Plains', 'Plains'], [LEGEND]);
    castAndFind(g);
    g.expect.life(0, 40);
    g.expect.pending('chooseCards', 0);
  });

  test('mana tapped by hand into the pool keeps the snow of its source', () => {
    const g = game([SNOW_PLAINS, SNOW_PLAINS, 'Plains']);
    g.act(0).tapForMana(`${SNOW_PLAINS}[0]`);
    g.act(0)
      .cast(QUEST)
      .payManual([`${SNOW_PLAINS}[1]`, 'Plains']);
    g.passAll();
    // The pool held {W} from the first snow land, the second snow land was tapped as the cost was paid, the Plains is no snow source: two snow mana.
    g.expect.life(0, 42);
  });

  test('mana that was not spent on the spell is not counted: a fourth snow land stays untapped', () => {
    const g = game([SNOW_PLAINS, SNOW_PLAINS, SNOW_PLAINS, SNOW_PLAINS]);
    castAndFind(g);
    g.expect.life(0, 43);
  });

  test('a copy of the spell was not cast: no mana was spent on it, 0 life (CR 707.10)', () => {
    const g = scenario()
      .seat(0)
      .hand(QUEST, 'SYNTHETIC Twin Spell')
      .battlefield(SNOW_PLAINS, SNOW_PLAINS, SNOW_PLAINS, 'Island', 'Island')
      .library('Plains')
      .seat(1)
      .library('Plains')
      .build();
    g.act(0).cast(QUEST, { pay: true });
    g.act(0).cast('SYNTHETIC Twin Spell', {
      targets: [{ name: QUEST, zone: 'stack' }],
      pay: true,
    });
    g.passAll();
    // The copy resolves first (0 snow mana spent to cast it), then the spell itself with its three snow mana.
    g.expect.life(0, 43);
  });
});

describe('the search for a snow permanent card, a legendary card, or a Saga card', () => {
  const library = [SPRITE, FLURRY, LEGEND, SAGA, SNOW_PLAINS, 'Grizzly Bears', 'Plains'];

  test('offers the snow permanents, the legendary cards and the Sagas, and nothing else (CR 205.4g)', () => {
    const g = scenario()
      .seat(0)
      .hand(QUEST)
      .battlefield('Plains', 'Plains', 'Plains')
      .library(SPRITE, { label: 'sprite' })
      .library(FLURRY, { label: 'flurry' })
      .library(LEGEND, { label: 'legend' })
      .library(SAGA, { label: 'saga' })
      .library(SNOW_PLAINS, { label: 'snowPlains' })
      .library('Grizzly Bears', { label: 'bears' })
      .library('Plains', { label: 'plains' })
      .seat(1)
      .library('Plains')
      .build();
    castAndFind(g);
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('search');
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.reveal).toBe(true);
    expect(d.prompt).toBe(
      'Choose up to one snow permanent, legendary, or Saga card; it goes into your hand. ' +
        'The cards you find are revealed. Then your library is shuffled.',
    );
    // By name: the sprite, the legend, the Saga and the snow land. The snow instant is no permanent card; the Bears and the Plains are neither.
    expect([...d.legal].sort()).toEqual(
      [g.id('sprite'), g.id('legend'), g.id('saga'), g.id('snowPlains')].sort(),
    );
  });

  test('puts the chosen card into the hand, reveals it and shuffles (CR 701.23e, 701.24b)', () => {
    const g = game(['Plains', 'Plains', 'Plains'], library);
    castAndFind(g);
    const sprite = g.find({ name: SPRITE, zone: 'library', seat: 0 })[0];
    expect(sprite).toBeDefined();
    g.act(0).chooseCards(SPRITE);
    g.expect.zone(SPRITE, 'hand', { seat: 0 });
    g.expect.librarySize(0, library.length - 1);
    g.expect.invariants();
  });

  test('the snow instant is found by none of the three kinds', () => {
    const g = game(['Plains', 'Plains', 'Plains'], [FLURRY, 'Grizzly Bears']);
    castAndFind(g);
    // Nothing matches: no question, the library is searched and shuffled.
    g.expect.pending('priority', 0);
    g.expect.zone(FLURRY, 'library', { seat: 0 });
  });

  test('the invariants hold with snow mana spent', () => {
    const g = game([SNOW_PLAINS, SNOW_PLAINS, SNOW_PLAINS], library);
    g.act(0).cast(QUEST, { pay: true });
    expect(checkInvariants(g.state)).toEqual([]);
  });
});

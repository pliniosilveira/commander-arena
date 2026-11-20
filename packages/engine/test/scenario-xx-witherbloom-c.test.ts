// Witherbloom Witchcraft group C (issue 190): "Destroy each nonland permanent with mana value X or less" (a sweeper that reads the X announced for the spell).
// Pins: CR 107.3a (the controller announces X as the spell is cast), CR 202.3 (mana value of a permanent: the X of a cost counts 0 off the stack, CR 202.3e), CR 701.8 (destroy).
// Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GAZE = 'SYNTHETIC Granite Gaze C';
const eachAtMostX = {
  kind: 'destroy',
  objects: {
    kind: 'each',
    filter: { notTypes: ['land'], manaValueAtMost: { kind: 'x' } },
  },
} as const;
const gaze = singleFace({
  name: GAZE,
  manaCost: ['X', 'B', 'B', 'G'],
  types: ['sorcery'],
  colors: ['B', 'G'],
  colorIdentity: ['B', 'G'],
  oracleText: 'Destroy each nonland permanent with mana value X or less.',
  spell: { x: true, effect: eachAtMostX },
});

describe('"Destroy each nonland permanent with mana value X or less" (CR 107.3a, 202.3, 701.8)', () => {
  test('the card is valid; the same effect with no X to read is not', () => {
    expect(validateCard(gaze)).toEqual([]);
    const noX = singleFace({
      name: 'SYNTHETIC Granite Gaze C No X',
      manaCost: ['B'],
      types: ['sorcery'],
      colors: ['B'],
      colorIdentity: ['B'],
      oracleText: 'Destroy each nonland permanent with mana value X or less.',
      spell: { effect: eachAtMostX },
    });
    expect(validateCard(noX).length).toBeGreaterThan(0);
  });

  const game = (x: number) => {
    const g = scenario()
      .define(gaze)
      .seat(0)
      .hand(GAZE)
      .battlefield('Swamp', { count: 4 })
      .battlefield('Forest', { count: 4 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Giant Spider')
      .battlefield('Grizzly Bears')
      .battlefield('Plains')
      .build();
    g.act(0).cast(GAZE, { x, pay: true });
    g.passAll();
    return g;
  };

  test('X = 2 destroys every nonland permanent of mana value 2 or less, whoever controls it, and keeps lands and larger ones', () => {
    const g = game(2);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
    g.expect.zone('Plains', 'battlefield', { seat: 1 });
  });

  test('X = 4 destroys the Spider too; X = 0 destroys neither creature', () => {
    const big = game(4);
    big.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
    big.expect.zone('Plains', 'battlefield', { seat: 1 });
    const none = game(0);
    none.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    none.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
  });
});

// "For each permanent type, return up to one card of that type from your graveyard to the battlefield. You lose 3 life for each card returned this way. Exile this spell."
// Pins: CR 608.2c (a later instruction reads what an earlier one did: "returned this way" counts the cards the choices put onto the battlefield), CR 608.2d (the controller
// chooses), CR 110.2a (they enter under the controller's control), CR 119.3 (life loss).
const TYPES = ['artifact', 'battle', 'creature', 'enchantment', 'land', 'planeswalker'] as const;
const REVIVE = 'SYNTHETIC Revival Test C';
const revive = (name: string, perType = true) =>
  singleFace({
    name,
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Return up to one card of each permanent type; lose 3 life for each; exile this.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          ...(perType ? TYPES : (['creature'] as const)).map((t) => ({
            kind: 'moveToZone' as const,
            objects: {
              kind: 'choose' as const,
              filter: { zone: 'graveyard' as const, types: [t], controller: 'you' as const },
              optional: true as const,
            },
            to: 'battlefield' as const,
          })),
          {
            kind: 'loseLife',
            player: { kind: 'you' },
            amount: { kind: 'multiple', factor: 3, of: { kind: 'thisWay', what: 'returned' } },
          },
          { kind: 'exile', objects: { kind: 'thisSpell' } },
        ],
      },
    },
  });
const TRINKET = 'SYNTHETIC Test Trinket C';
const WARDER = 'SYNTHETIC Test Warder C';
const GOLEM = 'SYNTHETIC Test Golem C';
const trinket = singleFace({
  name: TRINKET,
  manaCost: ['1'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: '',
});
const warder = singleFace({
  name: WARDER,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: '',
});
const golem = singleFace({
  name: GOLEM,
  manaCost: ['3'],
  types: ['artifact', 'creature'],
  subtypes: ['Golem'],
  colors: [],
  colorIdentity: [],
  oracleText: '',
  power: 2,
  toughness: 2,
});

describe('one card of each permanent type from the graveyard, then "for each card returned this way" (CR 608.2c)', () => {
  const build = () =>
    scenario()
      .define(revive(REVIVE))
      .define(trinket)
      .define(warder)
      .define(golem)
      .seat(0)
      .hand(REVIVE)
      .battlefield('Swamp')
      .graveyard('Grizzly Bears', 'Giant Spider', 'Plains', TRINKET, WARDER, GOLEM)
      .build();

  test('the card is valid', () => {
    expect(validateCard(revive(REVIVE))).toEqual([]);
  });

  test('returns the chosen cards, loses 3 life for each, and exiles the spell', () => {
    const g = build();
    g.act(0).cast(REVIVE, { pay: true });
    g.passAll();
    g.act(0).chooseCards(TRINKET);
    g.act(0).chooseCards('Grizzly Bears');
    g.act(0).chooseCards(WARDER);
    g.act(0).chooseCards('Plains');
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.zone(WARDER, 'battlefield', { seat: 0 });
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.zone(GOLEM, 'graveyard', { seat: 0 });
    g.expect.life(0, 28);
    g.expect.zone(REVIVE, 'exile', { seat: 0 });
  });

  test('declining every choice returns nothing and costs no life', () => {
    const g = build();
    g.act(0).cast(REVIVE, { pay: true });
    g.passAll();
    for (let i = 0; i < 4; i += 1) g.act(0).chooseCards();
    g.expect.life(0, 40);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone(REVIVE, 'exile', { seat: 0 });
  });

  test('a card of two types returned for the first one is not there for the second', () => {
    const g = build();
    g.act(0).cast(REVIVE, { pay: true });
    g.passAll();
    g.act(0).chooseCards(GOLEM);
    g.act(0).chooseCards('Grizzly Bears');
    g.act(0).chooseCards();
    g.act(0).chooseCards();
    g.expect.zone(GOLEM, 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.life(0, 34);
  });

  test('with nothing in the graveyard to return, "returned this way" counts none', () => {
    const g = scenario().define(revive(REVIVE)).seat(0).hand(REVIVE).battlefield('Swamp').build();
    g.act(0).cast(REVIVE, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });
});

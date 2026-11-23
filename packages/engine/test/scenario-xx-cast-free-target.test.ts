// "{1}: You may play target Elemental card from your graveyard without paying its mana cost." (SYNTHETIC sibling of Horde of Notions): `castFree` over a target card of
// the controller's own graveyard, with `play`.
// Pins: CR 115.1 and 608.2b (the card is a target, and nothing happens to a target that left the graveyard), CR 608.2g and 118.9 (a spell is cast as the ability resolves,
// without paying its mana cost, no priority in between), CR 305.1, 305.2a and 305.3 (a land card is played, not cast: it uses the land play, and only in the player's own turn),
// CR 400.7 (a card that left the graveyard is a new object).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, getView, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const HORDE = 'SYNTHETIC Horde Caller'; // {1}: play target Elemental card from your graveyard without paying its mana cost
const SPARK = 'SYNTHETIC Costly Spark'; // {5}{R} 2/2 Elemental creature
const MEADOW = 'SYNTHETIC Elemental Meadow'; // a land with the Elemental subtype
const BEARS = 'Grizzly Bears'; // not an Elemental
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const horde: CardDefinition = singleFace({
  name: HORDE,
  manaCost: ['2'],
  types: ['creature'],
  subtypes: ['Elemental'],
  colors: [],
  colorIdentity: [],
  power: 1,
  toughness: 1,
  oracleText:
    '{1}: You may play target Elemental card from your graveyard without paying its mana cost.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'graveyard', controller: 'you', subtypes: ['Elemental'] },
          },
        },
      ],
      effect: { kind: 'castFree', objects: { kind: 'target', id: 't1' }, play: true },
    },
  ],
});
const spark: CardDefinition = singleFace({
  name: SPARK,
  manaCost: ['5', 'R'],
  types: ['creature'],
  subtypes: ['Elemental'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 2,
  toughness: 2,
  oracleText: '',
});
const meadow: CardDefinition = singleFace({
  name: MEADOW,
  manaCost: null,
  types: ['land'],
  subtypes: ['Elemental'],
  colors: [],
  colorIdentity: [],
  oracleText: '',
});

function game(active = 0, landsPlayed = 0): ScenarioGame {
  return scenario()
    .define(horde)
    .define(spark)
    .define(meadow)
    .seat(0)
    .library(...FILLER)
    .battlefield(HORDE)
    .battlefield('Plains', { count: 2 })
    .graveyard(SPARK, MEADOW, BEARS)
    .landsPlayed(landsPlayed)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active, turn: 3 })
    .build();
}

describe('castFree of a target card of your graveyard', () => {
  test('the card is valid', () => {
    expect(validateCard(horde)).toEqual([]);
  });

  test('a spell is cast for no mana, and resolves onto the battlefield', () => {
    const g = game();
    g.act(0).activate(HORDE, { pay: true, targets: [SPARK] });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(SPARK);
    g.expect.stack([SPARK]);
    g.passAll();
    g.expect.zone(SPARK, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a land is played from the graveyard as the land play of the turn', () => {
    const g = game();
    g.act(0).activate(HORDE, { pay: true, targets: [MEADOW] });
    g.passAll();
    g.act(0).chooseCards(MEADOW);
    g.expect.zone(MEADOW, 'battlefield', { seat: 0 });
    expect(getView(g.state, 0).seats[0]?.landsPlayedThisTurn).toBe(1);
    g.expect.invariants();
  });

  test('a land cannot be played with no land play left, and is not offered', () => {
    const g = game(0, 1);
    g.act(0).activate(HORDE, { pay: true, targets: [MEADOW] });
    g.passAll();
    g.expect.zone(MEADOW, 'graveyard', { seat: 0 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('declining leaves the card in the graveyard', () => {
    const g = game();
    g.act(0).activate(HORDE, { pay: true, targets: [SPARK] });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(SPARK, 'graveyard', { seat: 0 });
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('a card of the graveyard that is not an Elemental is not a legal target', () => {
    const g = game();
    expect(() => g.act(0).activate(HORDE, { pay: true, targets: [BEARS] })).toThrow();
  });
});

// "Exile target nonland permanent an opponent controls and all tokens that player controls with the same name as that permanent" (Legions to Ashes, Revival Trance deck): the
// `plus` of an `each` selector adds the target itself to the tokens `sameNameAs` and `controlledBy` name. Pins: CR 201.2 (names), CR 111.1 (tokens), CR 406.1 (exile),
// CR 109.4 (a player controls the permanents under their control).
// The cards are SYNTHETIC; defined here.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SPELL = 'SYNTHETIC Exile Same Name';
const MAKER = 'SYNTHETIC Clue Maker';
const FOOD_MAKER = 'SYNTHETIC Food Maker';
const BEARS = 'Grizzly Bears';

const CARD = singleFaceCard({
  name: SPELL,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'Exile target nonland permanent an opponent controls and all tokens that player controls with the same name as that permanent.',
  spell: {
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', notTypes: ['land'], controller: 'opponent' },
        },
      },
    ],
    effect: {
      kind: 'exile',
      objects: {
        kind: 'each',
        filter: {
          zone: 'battlefield',
          token: true,
          sameNameAs: { kind: 'target', id: 't1' },
          controlledBy: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
        },
        plus: { kind: 'target', id: 't1' },
      },
    },
  },
});

const maker = (name: string, preset: 'Clue' | 'Food') =>
  singleFaceCard({
    name,
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Create two tokens.',
    spell: {
      effect: { kind: 'createToken', token: { kind: 'preset', preset }, count: 2 },
    },
  });

/** Seat 1 makes two Clues and two Foods, seat 2 two Clues; seat 0 holds the spell. */
function board() {
  const g = scenario({ seats: 3 })
    .define(CARD)
    .define(maker(MAKER, 'Clue'))
    .define(maker(FOOD_MAKER, 'Food'))
    .seat(0)
    .hand(SPELL)
    .pool('B')
    .seat(1)
    .hand(MAKER, FOOD_MAKER)
    .pool('GG')
    .battlefield(BEARS)
    .seat(2)
    .hand(MAKER)
    .pool('G')
    .at('precombatMain', { active: 0 })
    .build();
  // Priority returns to the active player (seat 0) after each resolution.
  for (const [seat, name] of [
    [1, MAKER],
    [1, FOOD_MAKER],
    [2, MAKER],
  ] as const) {
    g.pass(0);
    if (seat === 2) g.pass(1);
    g.act(seat).cast(name, { pay: true });
    g.passAll();
  }
  return g;
}

describe('the target and the tokens with its name that its controller controls (CR 201.2, 111.1)', () => {
  test('a token target exiles every token of that name its controller controls, and nothing else', () => {
    const g = board();
    g.expect.zone('Clue', 'battlefield', { seat: 1, count: 2 });
    g.act(0).cast(SPELL, { targets: [{ name: 'Clue', seat: 1, nth: 0 }], pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 1, count: 0 });
    g.expect.zone('Food', 'battlefield', { seat: 1, count: 2 });
    g.expect.zone('Clue', 'battlefield', { seat: 2, count: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('a nontoken target is exiled, and tokens with other names stay', () => {
    const g = board();
    g.act(0).cast(SPELL, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone('Clue', 'battlefield', { seat: 1, count: 2 });
    g.expect.zone('Clue', 'battlefield', { seat: 2, count: 2 });
    g.expect.invariants();
  });
});

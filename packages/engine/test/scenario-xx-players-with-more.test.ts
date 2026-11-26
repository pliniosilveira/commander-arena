// "The number of players who control more lands than you" (Oreskos Explorer): the player selector `eachPlayerControllingMore`, counted by the amount `playerCount`.
// Pins: CR 102.1 (players), CR 109.4 (a permanent is controlled by one player), CR 101.4 (the order of the players), CR 608.2c (read as the effect resolves).
// The card is SYNTHETIC, defined here, and the table has three seats so the count is a number and not a yes or no.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const COUNTER = singleFace({
  name: 'SYNTHETIC Land Counter',
  manaCost: ['1'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: [],
  colorIdentity: [],
  power: 1,
  toughness: 1,
  oracleText:
    'At the beginning of your end step, draw a card for each player who controls more lands than you.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'you' },
      effect: {
        kind: 'draw',
        player: { kind: 'you' },
        count: {
          kind: 'playerCount',
          of: { kind: 'eachPlayerControllingMore', filter: { types: ['land'] } },
        },
      },
    },
  ],
});
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

const build = (mine: number, one: number, two: number) => {
  const b = scenario({ seats: 3 }).define(COUNTER);
  b.seat(0)
    .library(...LIBRARY)
    .battlefield(COUNTER.name);
  for (let i = 0; i < mine; i += 1) b.battlefield('Island');
  b.seat(1).library(...LIBRARY);
  for (let i = 0; i < one; i += 1) b.battlefield('Island');
  b.seat(2).library(...LIBRARY);
  for (let i = 0; i < two; i += 1) b.battlefield('Island');
  return b.at('precombatMain', { active: 0 }).build();
};

describe('players who control more lands than you', () => {
  test('the card is valid', () => {
    expect(validateCard(COUNTER)).toEqual([]);
  });

  test('both opponents with more lands: two', () => {
    const g = build(1, 3, 2);
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('one opponent with more lands, one with as many: one (as many is not more)', () => {
    const g = build(2, 3, 2);
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('nobody with more: none', () => {
    const g = build(3, 1, 3);
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 0);
  });
});

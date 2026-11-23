// "Starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen. Return each card chosen this way to the battlefield
// under your control" (Rejoin the Fight, Revival Trance deck): `eachOpponentChoosesGraveyardCard`. Pins: CR 101.4 (players choosing in turn order), CR 608.2d (the choice),
// CR 404.1 (the graveyard is the controller's), CR 110.2a (the cards enter under the controller's control), CR 603.6a (the cards enter together).
// The card is SYNTHETIC; defined here.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SPELL = 'SYNTHETIC Opponents Choose';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const ANGEL = 'Serra Angel';

const CARD = singleFaceCard({
  name: SPELL,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    "Starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen. Return each card chosen this way to the battlefield under your control.",
  spell: {
    effect: {
      kind: 'eachOpponentChoosesGraveyardCard',
      filter: { zone: 'graveyard', types: ['creature'] },
    },
  },
});

const board = (graveyard: readonly string[], active = 0) =>
  scenario({ seats: 3 })
    .define(CARD)
    .seat(active)
    .hand(SPELL)
    .pool('B')
    .graveyard(...graveyard)
    .seat((active + 1) % 3)
    .seat((active + 2) % 3)
    .at('precombatMain', { active })
    .build();

describe('each opponent chooses a different creature card of your graveyard (CR 101.4, 608.2d)', () => {
  test('the next opponent in turn order chooses first, then the following one, and the cards enter together under my control', () => {
    const g = board([BEARS, ELVES, ANGEL]);
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards({ name: ANGEL, seat: 0 });
    g.expect.pending('chooseCards', 2);
    // The card the first opponent chose is no longer offered (CR 608.2d: "that hasn't been chosen").
    expect(() => g.act(2).chooseCards({ name: ANGEL, seat: 0 })).toThrow();
    g.act(2).chooseCards({ name: ELVES, seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('with the active seat being the last one the order wraps: seat 0 chooses first when seat 2 casts', () => {
    const g = board([BEARS, ELVES, ANGEL], 2);
    g.act(2).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: BEARS, seat: 2 });
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards({ name: ELVES, seat: 2 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 2 });
    g.expect.zone(ELVES, 'battlefield', { seat: 2 });
  });

  test('a card cannot be chosen twice: with one card left for the second opponent it is chosen for them', () => {
    const g = board([BEARS, ELVES]);
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.act(1).chooseCards({ name: BEARS, seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.stack([]);
  });

  test('with fewer creature cards than opponents the later opponents choose nothing', () => {
    const g = board([BEARS]);
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

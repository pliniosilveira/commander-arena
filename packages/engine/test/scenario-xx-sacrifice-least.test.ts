// "Each opponent sacrifices a creature with the least power among creatures they control" (Witch-king, Bringer of Ruin deck): the mirror of the greatest choice (D-135).
// Pins: CR 701.21a (Sacrifice), CR 608.2d (the player who sacrifices chooses among the tied permanents), CR 208.1 (power).
// The card is SYNTHETIC; defined here.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const EDICT = 'SYNTHETIC Least Power Edict';
const ANGEL = 'Serra Angel'; // 4/4
const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1

/** "Each opponent sacrifices a creature with the least power among creatures they control." */
const EDICT_CARD = singleFaceCard({
  name: EDICT,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'Each opponent sacrifices a creature with the least power among creatures they control.',
  spell: {
    effect: {
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: { types: ['creature'] }, least: 'power', count: 1 },
      player: { kind: 'eachOpponent' },
    },
  },
});

const game = (theirs: readonly string[]) =>
  scenario()
    .define(EDICT_CARD)
    .seat(0)
    .hand(EDICT)
    .pool('B')
    .seat(1)
    .battlefield(...theirs)
    .build();

describe('a creature with the least power (CR 701.21a, 608.2d)', () => {
  test('only the creature with the least power can be sacrificed, and the engine takes it without asking', () => {
    const g = game([ANGEL, BEARS, ELVES]);
    g.act(0).cast(EDICT, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });

  test('with several tied for the least power the player who sacrifices chooses among them only', () => {
    const g = game([ANGEL, `${BEARS}`, `${BEARS}`]);
    g.act(0).cast(EDICT, { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 1 });
    g.act(1).choosePermanents(`${BEARS}[0]`);
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });
});

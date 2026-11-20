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

describe('a creature that dealt combat damage to you this turn (CR 510.2, 701.21a)', () => {
  const EDICT_DAMAGED = 'SYNTHETIC Damaged You Edict';
  const CARD = singleFaceCard({
    name: EDICT_DAMAGED,
    manaCost: ['B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Each opponent sacrifices a creature that dealt combat damage to you this turn.',
    spell: {
      effect: {
        kind: 'sacrifice',
        objects: { kind: 'choose', filter: { types: ['creature'] }, dealtCombatDamageToYou: true },
        player: { kind: 'eachOpponent' },
      },
    },
  });

  test('only the creature that dealt combat damage to the caster this turn can be chosen', () => {
    const g = scenario()
      .define(CARD)
      .seat(0)
      .hand(EDICT_DAMAGED)
      .battlefield('Swamp')
      .seat(1)
      .battlefield(ANGEL, BEARS)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack([BEARS]);
    g.advanceTo('combatDamage');
    g.act(1).pass();
    g.act(0).cast(EDICT_DAMAGED, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });
});

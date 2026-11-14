// "Each player sacrifices a creature" (cleanup C, DEV-06): the players choose in APNAP order, then the creatures chosen are sacrificed
// simultaneously.
// Pins: CR 101.4 (the active player chooses, then each nonactive player in turn order, and then the actions happen simultaneously),
// CR 101.4b (a player knows the choices of the previous players), CR 701.21 (sacrifice), CR 603.10a (a creature that is sacrificed with
// others sees them die: the abilities that trigger from a simultaneous event look back in time).
// Cards are SYNTHETIC; defined here.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WATCHER = 'SYNTHETIC Sacrifice Watcher';
const EACH_SAC = 'SYNTHETIC Each Player Edict';
const BEARS = 'Grizzly Bears';

/** "Whenever a creature dies, you gain 1 life." */
const WATCHER_CARD = singleFaceCard({
  name: WATCHER,
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Human'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 1,
  toughness: 1,
  oracleText: 'Whenever a creature dies, you gain 1 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'] } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    },
  ],
});

/** "Each player sacrifices a creature." */
const EDICT_CARD = singleFaceCard({
  name: EACH_SAC,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'Each player sacrifices a creature.',
  spell: {
    effect: {
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: { types: ['creature'] }, count: 1 },
      player: { kind: 'eachPlayer' },
    },
  },
});

const game = (mine: readonly string[], theirs: readonly string[]) =>
  scenario()
    .define(WATCHER_CARD)
    .define(EDICT_CARD)
    .seat(0)
    .life(20)
    .hand(EACH_SAC)
    .pool('B')
    .battlefield(...mine)
    .seat(1)
    .life(20)
    .battlefield(...theirs)
    .build();

describe('the choices come first, the sacrifices are simultaneous (CR 101.4)', () => {
  test('the active player chooses first, then the other player; nothing is sacrificed until both have chosen', () => {
    const g = game([WATCHER, BEARS], [BEARS, BEARS]);
    g.act(0).cast(EACH_SAC, { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 0 });
    g.act(0).choosePermanents(WATCHER);
    // Seat 1 is asked next, and seat 0's creature is still on the battlefield: it is sacrificed with seat 1's (CR 101.4).
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 1 });
    g.expect.zone(WATCHER, 'battlefield', { seat: 0 });
    g.act(1).choosePermanents(`${BEARS}[0]`);
    g.expect.zone(WATCHER, 'graveyard', { seat: 0 });
  });

  test('a creature sacrificed together with another sees it die (CR 603.10a): the Watcher gains 2', () => {
    const g = game([WATCHER, BEARS], [BEARS, BEARS]);
    g.act(0).cast(EACH_SAC, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(WATCHER);
    g.act(1).choosePermanents(`${BEARS}[0]`);
    g.passAll();
    // Its own death and the opponent's creature's death, both read as they happened together.
    g.expect.life(0, 22);
  });

  test('a player with no creature chooses nothing and the other still sacrifices', () => {
    const g = game([WATCHER, BEARS], []);
    g.act(0).cast(EACH_SAC, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(WATCHER);
    g.passAll();
    g.expect.zone(WATCHER, 'graveyard', { seat: 0 });
    g.expect.life(0, 21);
  });

  test('with one creature each nothing is asked and both go together', () => {
    const g = game([WATCHER], [BEARS]);
    g.act(0).cast(EACH_SAC, { pay: true });
    g.passAll();
    g.expect.zone(WATCHER, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(0, 22);
  });
});

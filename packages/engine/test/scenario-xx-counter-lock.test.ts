// "Stun counters can't be removed from permanents your opponents control." (`cantRemoveCounters`; the static ability of Fear of Sleep Paralysis) and "Whenever you fully unlock a Room"
// (`roomFullyUnlocked`). Cards are SYNTHETIC probes built here.
// Pins: CR 122.1d (a stun counter: the replacement effect that removes it instead of untapping), CR 701.26b (only a tapped permanent can be untapped; one that can't untap can't be
// untapped for a cost), CR 122.1 (removing and moving counters), CR 604.1 (a static ability), CR 101.4 (every opponent, 3 seats), CR 709.5h, 709.5i (fully unlock a Room).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, type Effect, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const LOCK = 'SYNTHETIC Stun Lock';
const SCRUB = 'SYNTHETIC Stun Scrub'; // "Remove all counters from target creature."
const SCRUB_ONE = 'SYNTHETIC Stun Scrub One'; // "Remove a stun counter from target creature."
const PROBE = 'SYNTHETIC Untap Cost Probe'; // "Untap a tapped creature you control: Draw a card."
const WATCHER = 'SYNTHETIC Room Watcher'; // "Whenever you fully unlock a Room, you gain 3 life."
const BEARS = 'Grizzly Bears';
const PLAIN = 'SYNTHETIC Plain Room // Bare Room';

const lock: CardDefinition = singleFace({
  name: LOCK,
  manaCost: ['2'],
  types: ['enchantment'],
  colors: [],
  colorIdentity: [],
  oracleText: "Stun counters can't be removed from permanents your opponents control.",
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'cantRemoveCounters',
        counter: 'stun',
        permanents: { controller: 'opponent' },
      },
    },
  ],
});

const spell = (name: string, effect: Effect): CardDefinition =>
  singleFace({
    name,
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'SYNTHETIC probe',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect,
    },
  });

const THAT = { kind: 'target', id: 't1' } as const;
const scrub = spell(SCRUB, { kind: 'removeAllCounters', objects: THAT });
const scrubOne = spell(SCRUB_ONE, {
  kind: 'removeCounters',
  objects: THAT,
  counter: 'stun',
  count: 1,
});

const probe: CardDefinition = singleFace({
  name: PROBE,
  manaCost: ['2'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC probe',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'untapPermanents', filter: { types: ['creature'] }, count: 1 }],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
});

const watcher: CardDefinition = singleFace({
  name: WATCHER,
  manaCost: ['2'],
  types: ['enchantment'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Whenever you fully unlock a Room, you gain 3 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'roomFullyUnlocked', who: 'you' },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
    },
  ],
});

const defs = (seats: 2 | 3 = 2) =>
  scenario({ seats }).define(lock).define(scrub).define(scrubOne).define(probe).define(watcher);

describe('the cards are valid', () => {
  test.each([lock, scrub, scrubOne, probe, watcher])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

/** Seat 0 holds the lock when `locked`; seat 1 and seat 2 each have a tapped Grizzly Bears with a stun counter; seat 0's own has one too. */
function threeSeats(locked: boolean, hand: readonly string[] = []): ScenarioGame {
  const stunned = { tapped: true, counters: { stun: 1 } } as const;
  return defs(3)
    .seat(0)
    .library('Island', 'Island', 'Island')
    .hand(...hand)
    .battlefield(...(locked ? [LOCK] : []))
    .battlefield('Island', 'Island', 'Island')
    .battlefield(BEARS, { label: 'mine', ...stunned })
    .seat(1)
    .library('Island', 'Island', 'Island')
    .battlefield(BEARS, { label: 'one', ...stunned })
    .seat(2)
    .library('Island', 'Island', 'Island')
    .battlefield(BEARS, { label: 'two', ...stunned })
    .at('precombatMain', { active: 0, priority: 0 })
    .build();
}

describe('the untap step (CR 502.3, 122.1d)', () => {
  test('without the lock a stun counter is removed instead of untapping', () => {
    const g = threeSeats(false);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('one');
    g.expect.counters('one', {});
  });

  test('3 seats: the creatures of both opponents stay tapped with their counter, turn after turn', () => {
    const g = threeSeats(true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('one');
    g.expect.counters('one', { stun: 1 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('two');
    g.expect.counters('two', { stun: 1 });
  });

  test('the creature of the controller of the lock is not covered: its counter comes off', () => {
    const g = threeSeats(true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('mine');
    g.expect.counters('mine', {});
  });
});

describe('effects that remove counters (CR 122.1)', () => {
  test('"remove a stun counter" takes none off a creature of an opponent', () => {
    const g = threeSeats(true, [SCRUB_ONE]);
    g.act(0).cast(SCRUB_ONE, { targets: ['one'], pay: true });
    g.passAll();
    g.expect.counters('one', { stun: 1 });
  });

  test('"remove a stun counter" takes one off when the lock is not there', () => {
    const g = threeSeats(false, [SCRUB_ONE]);
    g.act(0).cast(SCRUB_ONE, { targets: ['one'], pay: true });
    g.passAll();
    g.expect.counters('one', {});
  });

  test('"remove all counters" leaves the stun counter and takes the others', () => {
    const g = defs()
      .seat(0)
      .library('Island', 'Island')
      .hand(SCRUB)
      .battlefield(LOCK, 'Island')
      .seat(1)
      .library('Island', 'Island')
      .battlefield(BEARS, { label: 'one', counters: { stun: 1, '+1/+1': 2, shield: 1 } })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(SCRUB, { targets: ['one'], pay: true });
    g.passAll();
    g.expect.counters('one', { stun: 1 });
  });

  test('a creature of the controller of the lock loses the stun counter as usual', () => {
    const g = threeSeats(true, [SCRUB_ONE]);
    g.act(0).cast(SCRUB_ONE, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', {});
  });
});

describe('an untap cost (CR 701.26b, 118.3)', () => {
  const board = (locked: boolean) =>
    defs()
      .seat(0)
      .library('Island', 'Island')
      .battlefield(...(locked ? [LOCK] : []))
      .seat(1)
      .library('Island', 'Island')
      .battlefield(PROBE)
      .battlefield(BEARS, { tapped: true, counters: { stun: 1 } })
      .at('precombatMain', { active: 1, priority: 1 })
      .build();

  test('without the lock a tapped creature with a stun counter pays it (the counter is removed instead)', () => {
    board(false).expect.legal(1, { activate: PROBE });
  });

  test('with the lock the opponent cannot untap it to pay the cost', () => {
    board(true).expect.illegal(1, { activate: PROBE });
  });
});

describe('"Whenever you fully unlock a Room" (CR 709.5i)', () => {
  const board = (room: string, unlocked: readonly number[]) =>
    defs()
      .seat(0)
      .life(20)
      .library('Island', 'Island')
      .battlefield(WATCHER, 'Plains', 'Plains', 'Swamp', 'Island')
      .battlefield(room, { unlocked })
      .seat(1)
      .life(20)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('unlocking the second half triggers it', () => {
    const g = board(PLAIN, [0]);
    g.act(0).choose({ kind: 'unlockDoor', object: g.id(PLAIN), door: 1 });
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(0, 23);
  });

  test('unlocking the first half of a Room with neither unlocked does not', () => {
    const g = board(PLAIN, []);
    g.act(0).choose({ kind: 'unlockDoor', object: g.id(PLAIN), door: 0 });
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(0, 20);
  });
});

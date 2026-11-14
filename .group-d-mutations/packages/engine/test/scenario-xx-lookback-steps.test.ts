// "Looking back in time" is for events that happen at the same time (cleanup C, DEV-07).
// Pins: CR 603.10a (leaves-the-battlefield abilities look back in time: the game uses the abilities and the objects as they were
// immediately before the event, so permanents that leave in one event see each other leave), CR 603.2 and 608.2c (a spell's instructions
// are carried out one after another, in order: a permanent that left in an earlier instruction is not on the battlefield when the later
// instruction moves another one, so it does not see that one leave).
// KNOWN DEVIATION (D-160): triggers are collected once for the events of a whole resolution, and a run of consecutive departures is read as
// one event, so the first test below does not pass today; `test.fails` pins that, and fails (so the line must go) when it is fixed.
// Cards are SYNTHETIC; defined here.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MOURNING_BEAR = 'SYNTHETIC Lookback Mourner';
const TWO_STEPS = 'SYNTHETIC Two Step Reaper';
const ONE_STEP = 'SYNTHETIC One Step Reaper';
const BEARS = 'Grizzly Bears';

/** "Whenever a creature you control leaves the battlefield, you gain 1 life." */
const MOURNER = singleFaceCard({
  name: MOURNING_BEAR,
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 2,
  toughness: 2,
  oracleText: 'Whenever a creature you control leaves the battlefield, you gain 1 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield', what: { types: ['creature'], controller: 'you' } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    },
  ],
});

const T1 = { kind: 'target', id: 't1' } as const;
const T2 = { kind: 'target', id: 't2' } as const;
const CREATURE = { kind: 'object', filter: { types: ['creature'] } } as const;

/** "Destroy target creature. Then destroy target creature.": two instructions, one after the other. */
const REAPER_TWO_STEPS = singleFaceCard({
  name: TWO_STEPS,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'Destroy target creature. Then destroy another target creature.',
  spell: {
    targets: [
      { id: 't1', what: CREATURE },
      { id: 't2', what: CREATURE },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: T1 },
        { kind: 'destroy', objects: T2 },
      ],
    },
  },
});

/** "Destroy two target creatures.": one instruction, both leave at the same time. */
const REAPER_ONE_STEP = singleFaceCard({
  name: ONE_STEP,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'Destroy two target creatures.',
  spell: {
    targets: [{ id: 't1', what: CREATURE, min: 2, max: 2 }],
    effect: { kind: 'destroy', objects: T1 },
  },
});

const game = (spell: string) =>
  scenario()
    .define(MOURNER)
    .define(spell === TWO_STEPS ? REAPER_TWO_STEPS : REAPER_ONE_STEP)
    .seat(0)
    .life(20)
    .hand(spell)
    .pool('B')
    .battlefield(MOURNING_BEAR, BEARS)
    .seat(1)
    .life(20)
    .build();

describe('permanents that leave in separate instructions of one spell', () => {
  test.fails('the first one to leave does not see the second leave (CR 603.10a: only simultaneous events are looked back at)', () => {
    const g = game(TWO_STEPS);
    g.act(0).cast(TWO_STEPS, { targets: [MOURNING_BEAR, BEARS], pay: true });
    g.passAll();
    g.expect.zone(MOURNING_BEAR, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    // The Mourner saw itself leave (1 life). It was gone before the Bears were destroyed.
    g.expect.life(0, 21);
  });

  test('the same two in the other order: the Bears leave first, the Mourner sees them and itself', () => {
    const g = game(TWO_STEPS);
    g.act(0).cast(TWO_STEPS, { targets: [BEARS, MOURNING_BEAR], pay: true });
    g.passAll();
    g.expect.life(0, 22);
  });
});

describe('permanents that leave in one instruction', () => {
  test('see each other leave (CR 603.10a)', () => {
    const g = game(ONE_STEP);
    g.act(0).cast(ONE_STEP, { targets: [MOURNING_BEAR, BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 22);
  });
});

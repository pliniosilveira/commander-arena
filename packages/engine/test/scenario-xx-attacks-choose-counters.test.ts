// Issue 89 (Silverquill Influence), "... that attacking player draws a card and you put two +1/+1 counters on a creature you control." (D-653; Breena, the Demagogue).
// Pins: CR 701.34 (counters are put on a permanent the controller chooses as the effect resolves: not a target, so no hexproof or protection matters), CR 608.2d (the choice is made
// as the ability resolves), CR 603.2 (the trigger), CR 121.1 (draw).
// Cards: the SYNTHETIC "Counter Watcher" of this file and the real Grizzly Bears and Healer's Hawk.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WATCHER = 'SYNTHETIC Counter Watcher';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const watcher = singleFaceCard({
  name: WATCHER,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Bird', 'Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 3,
  toughness: 3,
  oracleText:
    'Whenever a player attacks one of your opponents, that attacking player draws a card and you put two +1/+1 counters on a creature you control.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'playerAttacksOpponent' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
          {
            kind: 'chooseObjects',
            id: 'c1',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
            count: 1,
            exactly: true,
          },
          {
            kind: 'addCounters',
            objects: { kind: 'chosen', id: 'c1' },
            counter: '+1/+1',
            count: 2,
          },
        ],
      },
    },
  ],
});

const myAttack = () => {
  const g = scenario()
    .seat(0)
    .define(watcher)
    .library(...LIBRARY)
    .battlefield(WATCHER, BEARS, HAWK)
    .seat(1)
    .library(...LIBRARY)
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 1 } }]);
  g.passAll();
  return g;
};

describe('"you put two +1/+1 counters on a creature you control"', () => {
  test('the controller chooses a creature as the ability resolves and it gets the counters', () => {
    const g = myAttack();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    g.act(0).choosePermanents(HAWK);
    g.expect.handSize(0, 1);
    expect(g.object(g.id(HAWK)).counters['+1/+1']).toBe(2);
    expect(g.object(g.id(BEARS)).counters['+1/+1']).toBeUndefined();
  });

  test('it is not "up to": choosing no creature is refused when one can be chosen', () => {
    const g = myAttack();
    expect(() => g.act(0).choosePermanents()).toThrow();
    g.expect.pending('choosePermanent', 0);
  });
});

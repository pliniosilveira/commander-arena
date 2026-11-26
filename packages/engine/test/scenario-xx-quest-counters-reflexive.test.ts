// "Landfall — Whenever a land you control enters, put a quest counter on ~. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target creature you control. It
// gains trample until end of turn." (the SYNTHETIC "Quest Garden" of this file), run by the engine.
// Pins: CR 603.12 (the reflexive ability is created when the counter was put, and its target is chosen only then), CR 603.4 (the intervening "if" is checked as the ability
// would trigger and again as it resolves), CR 122.1 (the number of counters of one kind), CR 603.3d (a reflexive ability with no legal target is removed).
// Cards: the SYNTHETIC "Quest Garden" and the real Forest, Grizzly Bears and Giant Spider.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const GARDEN = 'SYNTHETIC Quest Garden';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const garden = singleFaceCard({
  name: GARDEN,
  manaCost: ['2', 'G'],
  types: ['enchantment'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText:
    'Landfall — Whenever a land you control enters, put a quest counter on ~. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target creature you control. It gains trample until end of turn.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'addCounters',
            objects: { kind: 'this' },
            counter: 'quest',
            count: 1,
          },
          {
            kind: 'reflexive',
            ifThisWay: 'countersPut',
            interveningIf: { kind: 'sourceHasCounter', counter: 'quest', atLeast: 4 },
            targets: [
              {
                id: 't1',
                what: {
                  kind: 'object',
                  filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
                },
              },
            ],
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'addCounters',
                  objects: { kind: 'target', id: 't1' },
                  counter: '+1/+1',
                  count: 1,
                },
                {
                  kind: 'grantKeyword',
                  objects: { kind: 'target', id: 't1' },
                  keyword: { kind: 'trample' },
                  duration: 'untilEndOfTurn',
                },
              ],
            },
          },
        ],
      },
    },
  ],
});

const game = (quest: number, creature = true) => {
  const b = scenario({ seats: 3 })
    .define(garden)
    .seat(0)
    .library(...LIBRARY)
    .hand('Forest')
    .battlefield(GARDEN, { counters: { quest } });
  if (creature) b.battlefield('Grizzly Bears');
  return b
    .seat(1)
    .library(...LIBRARY)
    .seat(2)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
};

describe('"put a quest counter on ~. When you do, if it has four or more quest counters on it, ..."', () => {
  test('is a valid card', () => {
    expect(validateCard(garden)).toEqual([]);
  });

  test('the fourth counter: the reflexive ability puts a +1/+1 counter and trample on the target (CR 603.12)', () => {
    const g = game(3);
    g.act(0).playLand('Forest');
    g.passAll();
    // The only creature is the one legal target: it is chosen as the reflexive ability goes on the stack.
    g.passAll();
    g.expect.counters(GARDEN, { quest: 4 });
    g.expect.counters('Grizzly Bears', { '+1/+1': 1 });
    g.expect.derived('Grizzly Bears', { keywords: ['trample'] });
    g.expect.invariants();
  });

  test('the third counter: the condition is false, nothing is created (CR 603.4)', () => {
    const g = game(2);
    g.act(0).playLand('Forest');
    g.passAll();
    g.expect.counters(GARDEN, { quest: 3 });
    g.expect.counters('Grizzly Bears', {});
    g.expect.stack([]);
  });

  test('with no creature to target the reflexive ability is removed (CR 603.3d)', () => {
    const g = game(3, false);
    g.act(0).playLand('Forest');
    g.passAll();
    g.expect.counters(GARDEN, { quest: 4 });
    g.expect.stack([]);
  });
});

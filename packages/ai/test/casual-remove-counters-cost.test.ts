// CasualAgent and RandomLegalAgent answer the question of a cost that removes counters of any kind ("Remove two counters from among creatures you control", `counterPick` with
// `forCost`, CR 118.3, 122.1, 602.2b): an option the engine lists and accepts, never "Done" (a cost has none), on a real engine state built with the scenario DSL and a SYNTHETIC card
// written out here.
import {
  type Action,
  applyAction,
  type CardDefinition,
  getLegalActions,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

/** SYNTHETIC: "{T}, Remove two counters from among creatures you control: Draw a card." Not a real Magic card. */
const SIPHON: CardDefinition = {
  oracleId: null,
  name: 'SYNTHETIC Counter Siphon',
  layout: 'normal',
  faces: [
    {
      name: 'SYNTHETIC Counter Siphon',
      manaCost: ['1'],
      supertypes: [],
      types: ['artifact'],
      subtypes: [],
      colors: [],
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText: '{T}, Remove two counters from among creatures you control: Draw a card.',
      abilities: [
        {
          kind: 'activated',
          cost: [
            { kind: 'tap' },
            {
              kind: 'removeCounters',
              count: 2,
              among: { types: ['creature'], controller: 'you' },
            },
          ],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
      spell: null,
    },
  ],
  colorIdentity: [],
  support: 'supported',
};

function asked(): ScenarioGame {
  const g = scenario()
    .define(SIPHON)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(SIPHON.name)
    .battlefield('Grizzly Bears', { counters: { charge: 2, '+1/+1': 1 } })
    .seat(1)
    .library(...LIBRARY)
    .build();
  g.act(0).activate(SIPHON.name);
  return g;
}

async function decide(g: ScenarioGame, agent: CasualAgent | RandomLegalAgent): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action) {
  expect(
    getLegalActions(g.state, 0).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, 0, action).ok).toBe(true);
}

describe('the counters of a cost, one at a time', () => {
  test('the question lists the counters, no way to stop, and a way out', () => {
    const g = asked();
    g.expect.pending('chooseOption', 0);
    const pending = g.state.pending;
    if (pending?.kind !== 'chooseOption') throw new Error('no question');
    expect(pending.forCost).toBe(true);
    expect(pending.options).toEqual([
      'charge counter on Grizzly Bears (yours)',
      '+1/+1 counter on Grizzly Bears (yours)',
    ]);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(true);
  });

  test('the casual agent answers with a counter the engine accepts', async () => {
    const g = asked();
    const a = await decide(g, new CasualAgent({ seed: 1 }));
    expect(a.kind).toBe('chooseOption');
    expectLegal(g, a);
  });

  test('the random agent answers with an action the engine lists', async () => {
    const g = asked();
    const a = await decide(g, new RandomLegalAgent({ seed: 3 }));
    expectLegal(g, a);
  });
});

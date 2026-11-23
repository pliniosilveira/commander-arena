// The AI's answer to "that player chooses up to two creatures they control, then sacrifices the rest" (a `choosePermanent` decision of purpose `keep` with a number of creatures and no
// total power, Archfiend of Depravity, CR 608.2d, 701.21a). The spell is SYNTHETIC (written as the engine's AST); the creatures are real fixtures.
import { applyAction, type CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, GreedyAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const KEEP_TWO: CardDefinition = {
  oracleId: null,
  name: 'SYNTHETIC AI Keep Two',
  layout: 'normal',
  faces: [
    {
      name: 'SYNTHETIC AI Keep Two',
      manaCost: ['1'],
      supertypes: [],
      types: ['sorcery'],
      subtypes: [],
      colors: [],
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText: 'SYNTHETIC spell.',
      abilities: [],
      spell: {
        effect: {
          kind: 'keepOrSacrifice',
          players: { kind: 'you' },
          filter: { types: ['creature'] },
          keepAtMost: 2,
        },
      },
    },
  ],
  colorIdentity: [],
  support: 'supported',
};

describe('"Choose up to two creatures you control, then sacrifice the rest"', () => {
  const start = () => {
    const g = scenario()
      .define(KEEP_TWO)
      .seat(0)
      .hand(KEEP_TWO.name)
      .pool('C')
      .battlefield('Serra Angel', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(KEEP_TWO.name, { pay: true });
    g.passAll();
    return g;
  };

  test('the decision asks for at most two creatures and no total power', () => {
    const g = start();
    expect(g.state.pending).toMatchObject({
      kind: 'choosePermanent',
      purpose: 'keep',
      seat: 0,
      min: 0,
      max: 2,
    });
    expect(g.state.pending).not.toHaveProperty('maxTotalPower');
  });

  test('every agent answers a choice the engine accepts, of at most two creatures', async () => {
    const agents = [
      new CasualAgent({ seed: 1 }),
      new GreedyAgent({ seed: 1 }),
      new HeuristicAgent({ seed: 1 }),
      new RandomLegalAgent({ seed: 1 }),
    ];
    for (const agent of agents) {
      const g = start();
      const view = g.view(0);
      if (view.pending === null) throw new Error('the seat does not see its decision');
      const action = await agent.decide(view, view.pending, CTX);
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
  });

  test('the casual agent keeps the two creatures it values most and the rest are sacrificed', async () => {
    const g = start();
    const view = g.view(0);
    if (view.pending === null) throw new Error('the seat does not see its decision');
    const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    expect(action).toMatchObject({ kind: 'choosePermanents' });
    g.choose(action);
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
  });
});

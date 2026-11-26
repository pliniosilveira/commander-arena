// The AI's answers to the two choices of the Sauron cost group: "Choose up to two creatures, then destroy the rest" (Mount Doom: a `choosePermanent` of purpose `effect` among everyone's
// creatures, CR 608.2d) and "Ward—Sacrifice a creature" (a `confirmOptional` of purpose `ward`, then a `choosePermanent` of purpose `sacrifice`, CR 702.21a, 701.21a). The cards are SYNTHETIC
// (written as the engine's AST); the creatures are real fixtures.
import { applyAction, type CardDefinition, type Effect } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, GreedyAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const creature = { types: ['creature'] } as const;

const card = (name: string, types: readonly ('sorcery' | 'creature')[], extra: object) =>
  ({
    oracleId: null,
    name,
    layout: 'normal',
    faces: [
      {
        name,
        manaCost: ['1'],
        supertypes: [],
        types,
        subtypes: [],
        colors: [],
        power: types.includes('creature') ? 2 : null,
        toughness: types.includes('creature') ? 2 : null,
        loyalty: null,
        defense: null,
        oracleText: 'SYNTHETIC card.',
        abilities: [],
        spell: null,
        ...extra,
      },
    ],
    colorIdentity: [],
    support: 'supported',
  }) as CardDefinition;

const DOOM_EFFECT: Effect = {
  kind: 'sequence',
  effects: [
    { kind: 'chooseObjects', id: 'kept', filter: creature, count: 2 },
    {
      kind: 'destroy',
      objects: { kind: 'each', filter: creature, except: { kind: 'chosen', id: 'kept' } },
    },
  ],
};
const DOOM = card('SYNTHETIC AI Doom', ['sorcery'], { spell: { effect: DOOM_EFFECT } });

describe('"Choose up to two creatures, then destroy the rest"', () => {
  const start = () => {
    const g = scenario({ seats: 3 })
      .define(DOOM)
      .seat(0)
      .hand(DOOM.name)
      .pool('C')
      .battlefield('Grizzly Bears', 'Llanowar Elves', 'Giant Spider')
      .seat(1)
      .battlefield('Serra Angel')
      .seat(2)
      .battlefield('Serra Angel')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(DOOM.name, { pay: true });
    g.passAll();
    return g;
  };

  test('every agent answers a choice the engine accepts', async () => {
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

  test('the casual agent keeps the two best creatures of its own, never an opponent one', async () => {
    const g = start();
    const view = g.view(0);
    if (view.pending === null) throw new Error('the seat does not see its decision');
    const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    g.choose(action);
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 2 });
  });
});

describe('"Ward—Sacrifice a creature"', () => {
  const WARDEN = card('SYNTHETIC AI Sacrifice Warden', ['creature'], {
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'ward', cost: [{ kind: 'sacrifice', what: creature }] },
      },
    ],
  });

  const start = (spell: string) => {
    const g = scenario()
      .define(WARDEN)
      .seat(0)
      .hand(spell, { label: 'spell' })
      .battlefield('Mountain', { count: 6 })
      .battlefield('Grizzly Bears', 'Llanowar Elves')
      .seat(1)
      .battlefield(WARDEN.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('spell', { targets: [WARDEN.name], pay: true });
    g.passAll();
    return g;
  };

  test('a cheap spell is not worth a permanent: the casual agent declines and it is countered', async () => {
    const g = start('Lightning Bolt');
    const view = g.view(0);
    if (view.pending === null) throw new Error('the seat does not see its decision');
    const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    expect(action).toEqual({ kind: 'declineOptional' });
    g.choose(action);
    g.expect.stack([]);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 0 });
  });

  test('every agent answers the question with a choice the engine accepts', async () => {
    const agents = [
      new CasualAgent({ seed: 1 }),
      new GreedyAgent({ seed: 1 }),
      new HeuristicAgent({ seed: 1 }),
      new RandomLegalAgent({ seed: 1 }),
    ];
    for (const agent of agents) {
      const g = start('Lightning Bolt');
      const view = g.view(0);
      if (view.pending === null) throw new Error('the seat does not see its decision');
      const action = await agent.decide(view, view.pending, CTX);
      const answered = applyAction(g.state, 0, action);
      expect(answered.ok, JSON.stringify(action)).toBe(true);
    }
  });

  test('having accepted, the choice of the permanent given up is the one the agent values least', async () => {
    const g = start('Lightning Bolt');
    g.act(0).accept();
    g.expect.pending('choosePermanent', 0);
    const view = g.view(0);
    if (view.pending === null) throw new Error('the seat does not see its decision');
    const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    g.choose(action);
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });
});

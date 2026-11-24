// Every agent answers a secret vote for players and a secret vote for creatures (CR 701.38a, 701.38b: `chooseOption` with purpose 'vote', options `seat:<n>` and `object:<id>`) with an option
// the engine lists and accepts, at a table of three seats. The decision an agent sees carries no vote of the players before it (CR 701.38a, "secretly"). The cards are SYNTHETIC: the
// instant of the engine's council fixtures with the vote nodes of Círdan the Shipwright and Trap the Trespassers written out.
import {
  type Action,
  applyAction,
  type CardDefinition,
  type ChooseOptionDecision,
  type Effect,
  getLegalActions,
  syntheticCard,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
} from '../src/index';
import { CTX } from './helpers';

const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

/** The SYNTHETIC instant of the council fixtures with another name and another effect. */
function instant(name: string, effect: Effect): CardDefinition {
  const base = syntheticCard('SYNTHETIC Council of Tides');
  const [face] = base.faces;
  if (face === undefined) throw new Error('no face');
  return {
    ...base,
    name,
    faces: [{ ...face, name, manaCost: ['U'], spell: { effect } }],
  };
}

const PLAYERS = instant('SYNTHETIC Secret Players', {
  kind: 'sequence',
  effects: [
    { kind: 'voteFor', choices: { kind: 'players' }, startingWith: 'you', secret: true },
    {
      kind: 'forEachPlayer',
      players: { kind: 'eachPlayer' },
      runsAs: 'each',
      effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'votesReceived' } },
    },
  ],
});

const CREATURES = instant('SYNTHETIC Secret Creatures', {
  kind: 'sequence',
  effects: [
    {
      kind: 'voteFor',
      choices: {
        kind: 'objects',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
      },
      startingWith: 'you',
      secret: true,
    },
    { kind: 'tap', objects: { kind: 'votedObjects' } },
  ],
});

/** Three seats; seat 0 cast `card`; the vote is asked of seat 0. */
function vote(card: CardDefinition): ScenarioGame {
  const g = scenario({ seats: 3 })
    .define(card)
    .seat(0)
    .library(...LIBRARY)
    .hand(card.name)
    .battlefield('Island')
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS)
    .seat(2)
    .library(...LIBRARY)
    .battlefield(BEARS)
    .at('precombatMain')
    .build();
  g.act(0).cast(card.name, { pay: true });
  g.passAll();
  g.expect.pending('chooseOption', 0);
  return g;
}

async function decide(g: ScenarioGame, agent: Agent): Promise<Action> {
  const seat = g.deciding;
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action) {
  const seat = g.deciding;
  expect(action.kind).toBe('chooseOption');
  expect(
    getLegalActions(g.state, seat).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, seat, action).ok).toBe(true);
}

const agents: readonly [string, () => Agent][] = [
  ['casual', () => new CasualAgent({ seed: 3 })],
  ['greedy', () => new GreedyAgent({ seed: 3 })],
  ['heuristic', () => new HeuristicAgent({ seed: 3 })],
  ['random', () => new RandomLegalAgent({ seed: 3 })],
];

describe('every agent answers a secret vote, in turn order, at a table of three', () => {
  test.each(agents)('%s: a vote for players', async (_name, make) => {
    const g = vote(PLAYERS);
    const agent = make();
    for (const seat of [0, 1, 2]) {
      const d = g.state.pending as ChooseOptionDecision;
      // CR 701.38a: nobody is told what the earlier voters chose.
      expect(d.vote?.cast).toEqual([]);
      expect(d.vote?.secret).toBe(true);
      const a = await decide(g, agent);
      expectLegal(g, a);
      if (a.kind !== 'chooseOption') throw new Error('not an option');
      g.act(seat).chooseOption(a.option);
    }
    // The vote is over and every player drew for the votes they received: three cards in all.
    const drawn = g.state.seats.reduce((n, seat) => n + seat.hand.length, 0);
    expect(drawn).toBe(3);
  });

  test.each(agents)(
    '%s: a vote for a creature the controller does not control',
    async (_name, make) => {
      const g = vote(CREATURES);
      const agent = make();
      for (const seat of [0, 1, 2]) {
        const a = await decide(g, agent);
        expectLegal(g, a);
        if (a.kind !== 'chooseOption') throw new Error('not an option');
        expect(a.option.startsWith('object:')).toBe(true);
        g.act(seat).chooseOption(a.option);
      }
    },
  );
});

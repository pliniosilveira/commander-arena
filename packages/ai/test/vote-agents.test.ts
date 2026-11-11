// Every agent answers a vote (CR 701.38a, D-194: `chooseOption` with purpose 'vote') with an option the engine lists and accepts, for the player who
// controls the effect and for the other player, on real engine states built with the scenario DSL and the SYNTHETIC cards of the engine's
// `synthetic-vote.ts` (Emissary Green with the card's real wording, and a three-option sorcery). The casual and greedy agents follow a fixed rule
// (the controller votes for the first option, another player for the option with the fewest votes so far, the later one on a tie), the heuristic
// agent plays each option out on a sample and scores the board (so it never votes itself dead and takes a win when one is there), the random agent
// picks among the options.
import {
  type Action,
  applyAction,
  type ChooseOptionDecision,
  getLegalActions,
  getView,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { chooseVote } from '../src/casual-vote';
import { evaluate } from '../src/evaluate';
import {
  type Agent,
  CasualAgent,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
} from '../src/index';
import { CTX } from './helpers';
import { askHeuristic } from './heuristic-helpers';

const EMISSARY = 'SYNTHETIC Emissary Green';
const RITE = 'SYNTHETIC Ballot Rite';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

/** Seat 0 attacks with Emissary Green and the vote is asked of seat 0. */
function emissaryVote(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(EMISSARY, BEARS)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS)
    .at('precombatMain')
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack([EMISSARY]);
  g.passAll();
  g.expect.pending('chooseOption', 0);
  return g;
}

/** Seat 0 cast Ballot Rite, seat 1 has `life`; the vote is asked of seat 0. */
function riteVote(life = 20): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(RITE)
    .battlefield('Island', 'Island', 'Island')
    .seat(1)
    .life(life)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast(RITE, { pay: true });
  g.passAll();
  g.expect.pending('chooseOption', 0);
  return g;
}

const question = (g: ScenarioGame): ChooseOptionDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error('no chooseOption decision');
  return d;
};

async function decide(g: ScenarioGame, agent: Agent): Promise<Action> {
  const seat = g.deciding;
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action) {
  const seat = g.deciding;
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

describe('every agent answers the vote of the controller and of the other player', () => {
  test.each(agents)('%s: a legal vote for the controller (Emissary Green)', async (_name, make) => {
    const g = emissaryVote();
    const a = await decide(g, make());
    expect(a.kind).toBe('chooseOption');
    expectLegal(g, a);
  });

  test.each(agents)(
    '%s: a legal vote for the opponent, after the controller voted',
    async (_name, make) => {
      const g = emissaryVote();
      g.act(0).chooseOption('profit');
      g.expect.pending('chooseOption', 1);
      const a = await decide(g, make());
      expect(a.kind).toBe('chooseOption');
      expectLegal(g, a);
    },
  );

  test.each(agents)('%s: a legal vote among three options', async (_name, make) => {
    const g = riteVote();
    const a = await decide(g, make());
    expectLegal(g, a);
    g.act(0).chooseOption('gold');
    expectLegal(g, await decide(g, make()));
  });
});

describe('the casual and greedy agents', () => {
  test('the controller votes for the first option the card lists', async () => {
    for (const make of [() => new CasualAgent({ seed: 3 }), () => new GreedyAgent({ seed: 3 })]) {
      const g = emissaryVote();
      expect(await decide(g, make())).toEqual({ kind: 'chooseOption', option: 'profit' });
    }
  });

  test('the other player votes for the option the controller did not choose', async () => {
    for (const make of [() => new CasualAgent({ seed: 3 }), () => new GreedyAgent({ seed: 3 })]) {
      const g = emissaryVote();
      g.act(0).chooseOption('profit');
      expect(await decide(g, make())).toEqual({ kind: 'chooseOption', option: 'security' });
      const h = emissaryVote();
      h.act(0).chooseOption('security');
      expect(await decide(h, make())).toEqual({ kind: 'chooseOption', option: 'profit' });
    }
  });

  test('with three options the other player takes the least voted, the later on a tie', () => {
    const base = {
      kind: 'chooseOption',
      seat: 1,
      purpose: 'vote',
      options: ['gold', 'iron', 'ash'],
    } as unknown as ChooseOptionDecision;
    const cast = (...votes: [number, string][]): ChooseOptionDecision =>
      ({
        ...base,
        vote: { controller: 0, cast: votes.map(([seat, option]) => ({ seat, option })) },
      }) as ChooseOptionDecision;
    expect(chooseVote(cast([0, 'gold']))).toEqual({ kind: 'chooseOption', option: 'ash' });
    expect(chooseVote(cast([0, 'ash']))).toEqual({ kind: 'chooseOption', option: 'iron' });
    expect(chooseVote(cast([0, 'iron']))).toEqual({ kind: 'chooseOption', option: 'ash' });
    // Three players: the first two backed gold and iron, so the third takes the one nobody backed.
    expect(
      chooseVote({ ...cast([0, 'gold'], [2, 'iron']), seat: 1 } as ChooseOptionDecision),
    ).toEqual({ kind: 'chooseOption', option: 'ash' });
  });
});

describe('the heuristic agent plays each option out', () => {
  /** The score for the seat that votes of casting `option` and letting the casual agent answer the rest, read apart from the agent. */
  const scoreOf = (g: ScenarioGame, option: string): number => {
    const seat = g.deciding;
    let state = g.state;
    let action: Action = { kind: 'chooseOption', option };
    for (let i = 0; i < 6; i += 1) {
      const d = state.pending;
      if (d === null) break;
      const out = applyAction(state, d.seat, action);
      if (!out.ok) throw new Error(out.error);
      state = out.state;
      const next = state.pending;
      if (next?.kind !== 'chooseOption' || next.purpose !== 'vote') break;
      action = chooseVote(next);
    }
    return evaluate(getView(state, seat), seat).score;
  };

  test.each([
    ['Emissary Green, the controller', emissaryVote],
    ['Ballot Rite, the controller', riteVote],
  ])('%s takes the option whose result scores best for it', async (_name, build) => {
    const g = build();
    const options = question(g).options;
    const scores = options.map((o) => scoreOf(g, o));
    const best = options[scores.indexOf(Math.max(...scores))];
    expect(await askHeuristic(g)).toEqual({ kind: 'chooseOption', option: best });
  });

  test('the opponent takes the option whose result scores best for the opponent (the controller voted first)', async () => {
    const g = riteVote();
    g.act(0).chooseOption('gold');
    const options = question(g).options;
    const scores = options.map((o) => scoreOf(g, o));
    const best = options[scores.indexOf(Math.max(...scores))];
    expect(await askHeuristic(g)).toEqual({ kind: 'chooseOption', option: best });
  });

  test('the opponent never votes itself dead: with 1 life it does not vote for ash', async () => {
    const g = riteVote(1);
    g.act(0).chooseOption('gold');
    const a = await askHeuristic(g);
    expect(a).not.toEqual({ kind: 'chooseOption', option: 'ash' });
  });

  test('the answer is the same each time (deterministic) and is one of the options', async () => {
    const first = await askHeuristic(emissaryVote());
    const second = await askHeuristic(emissaryVote());
    expect(second).toEqual(first);
    expect(question(emissaryVote()).options).toContain((first as { option: string }).option);
  });

  test('without a sample it answers as the casual agent does', async () => {
    const g = emissaryVote();
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }), { withSample: false });
    expect(a).toEqual({ kind: 'chooseOption', option: 'profit' });
  });
});

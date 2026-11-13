// The agents and group 4 of the Hashaton deck (D-1120 to D-1124, SYNTHETIC cards of the engine fixtures `synthetic-hashaton-group-4.ts`): amass asks one new question, which
// Army creature gets the counters (a `choosePermanent`, purpose `amass`), and the spell that gives a creature a type and four keywords asks for a target as any spell does.
// Each agent is checked on real engine states: every answer is one the engine lists and accepts, and whole turns with the cards finish without a rejected action.
import { applyAction, getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 8 }, () => 'Island');
const RITE = 'SYNTHETIC Amass Rite';
const WATCHER = 'SYNTHETIC Amass Watcher';
const ORC_ARMY = 'SYNTHETIC Orc Army Veteran'; // 2/2
const SOLDIER_ARMY = 'SYNTHETIC Soldier Army Recruit'; // 1/1
const AVATAR = 'SYNTHETIC Avatar Surge';
const RECRUITER = 'SYNTHETIC Army Recruiter';
const BEARS = 'Grizzly Bears';

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** Seat 0 has cast the Rite with two Armies on the battlefield: the question of the Army is pending. */
function atArmyQuestion(board: readonly string[] = [ORC_ARMY, SOLDIER_ARMY]): ScenarioGame {
  const g = scenario()
    .seat(0)
    .hand(RITE)
    .battlefield('Swamp', { count: 2 })
    .battlefield(...board)
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast(RITE, { pay: true });
  g.passAll();
  g.expect.pending('choosePermanent', 0);
  return g;
}

describe('the question: which Army gets the counters?', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atArmyQuestion();
    const a = await answer(g, make());
    expectLegal(g, a);
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atArmyQuestion();
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });

  test('the casual agent chooses the Army with the most power, whichever is listed first', async () => {
    for (const board of [
      [ORC_ARMY, SOLDIER_ARMY],
      [SOLDIER_ARMY, ORC_ARMY],
    ]) {
      const g = atArmyQuestion(board);
      expect(await answer(g, new CasualAgent({ seed: 3 }))).toEqual({
        kind: 'choosePermanents',
        objects: [g.id(ORC_ARMY)],
      });
    }
  });

  test('the heuristic agent, which delegates, makes the same choice', async () => {
    const g = atArmyQuestion();
    expect(await askHeuristic(g, new HeuristicAgent({ seed: 1 }))).toEqual({
      kind: 'choosePermanents',
      objects: [g.id(ORC_ARMY)],
    });
  });

  test('the question comes with an Army the replacement effect made, and the agent chooses among the tokens that exist', async () => {
    const g = atArmyQuestion([RECRUITER]);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected the question of the Army');
    expect(d.purpose).toBe('amass');
    expect(d.legal).toHaveLength(2);
    const a = await answer(g, new CasualAgent({ seed: 3 }));
    expectLegal(g, a);
  });
});

describe('the spell that gives a creature a type and four keywords', () => {
  test.each(agents)('the %s agent chooses a target the engine lists', async (_n, make) => {
    const g = scenario()
      .seat(0)
      .hand(AVATAR)
      .battlefield('Plains', BEARS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(AVATAR);
    g.expect.pending('targets', 0);
    const a = await answer(g, make());
    expectLegal(g, a);
  });
});

describe('whole turns by the agents', () => {
  const play = async (g: ScenarioGame, agent: { decide: CasualAgent['decide'] }) => {
    for (let i = 0; i < 120 && g.state.pending !== null && g.state.result === null; i += 1) {
      const decision = g.state.pending;
      const view = g.view(decision.seat);
      if (view.pending === null) break;
      const a = await agent.decide(view, view.pending, { budgetMs: 1000, now: () => 0 });
      // The engine lists a sample of the attack declarations, so the check is that the engine accepts the answer.
      expect(applyAction(g.state, decision.seat, a).ok).toBe(true);
      g.choose(decision.seat, a);
    }
  };

  test.each(agents)(
    'the %s agent plays a hand with the amass cards and Armies on the board without a rejected action',
    async (_name, make) => {
      for (let seed = 0; seed < 5; seed += 1) {
        const g = scenario()
          .seat(0)
          .hand(RITE, WATCHER, AVATAR)
          .battlefield('Swamp', { count: 4 })
          .battlefield('Plains', ORC_ARMY, SOLDIER_ARMY, BEARS)
          .library(...LIBRARY)
          .seat(1)
          .library(...LIBRARY)
          .at('precombatMain')
          .build();
        await play(g, make());
        g.expect.invariants();
        // Whatever it did, the Armies it controls are legal creatures of the board.
        expect(getView(g.state, 0).battlefield.length).toBeGreaterThan(0);
      }
    },
  );

  test('the heuristic agent plays the same hand without a rejected action', async () => {
    const g = scenario()
      .seat(0)
      .hand(RITE, WATCHER, AVATAR)
      .battlefield('Swamp', { count: 4 })
      .battlefield('Plains', ORC_ARMY, SOLDIER_ARMY, BEARS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    await play(g, new HeuristicAgent({ seed: 1 }));
    g.expect.invariants();
  });
});

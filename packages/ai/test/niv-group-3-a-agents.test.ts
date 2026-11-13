// The agents and group 3-a of the Niv-Mizzet deck (D-336, D-337, SYNTHETIC cards of the engine fixtures `synthetic-niv-group-3-a.ts`): the delayed trigger "when you
// next cast an instant or sorcery spell this turn, copy that spell" asks no new kind of question. The copy asks the ordinary question about the new targets (once
// for each copy), and the activated ability with the sacrifice is an ordinary `activate`. Each agent is checked on real engine states: every answer is one the
// engine lists and accepts, and whole turns with the cards finish without a rejected action.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal, sameAction } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 8 }, () => 'Island');
const ECHO = 'SYNTHETIC Next Echo';
const DRAKE = 'SYNTHETIC Commander Echo Drake';
const BOLT = 'Lightning Bolt';
const COMMANDER = 'Grizzly Bears';

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** The Echo has resolved, a Bolt is on the stack at the opponent and the trigger resolves: the copy asks for its targets. */
const copied = () => {
  const g = scenario()
    .seat(0)
    .hand(ECHO, BOLT)
    .battlefield('Island', { count: 4 })
    .battlefield('Mountain', { count: 4 })
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast(ECHO, { pay: true });
  g.passAll();
  g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
  g.pass();
  g.pass();
  g.expect.pending('targets', 0);
  return g;
};

describe('the copy the delayed trigger makes', () => {
  test.each(agents)(
    'the %s agent chooses targets for the copy that the engine lists',
    async (_name, make) => {
      const g = copied();
      const a = await answer(g, make());
      expectLegal(g, a);
      g.choose(0, a);
      g.expect.stack([BOLT, BOLT]);
    },
  );

  test('the heuristic agent chooses targets for the copy that the engine lists', async () => {
    const g = copied();
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });
});

describe('whole turns by the agents', () => {
  const play = async (g: ScenarioGame, agent: { decide: CasualAgent['decide'] }) => {
    for (let i = 0; i < 60 && g.state.pending !== null && g.state.result === null; i += 1) {
      const decision = g.state.pending;
      const view = g.view(decision.seat);
      if (view.pending === null) break;
      const a = await agent.decide(view, view.pending, { budgetMs: 1000, now: () => 0 });
      expect(getLegalActions(g.state, decision.seat).some((x) => sameAction(x, a))).toBe(true);
      g.choose(decision.seat, a);
    }
  };

  test.each(agents)(
    'the %s agent plays a hand with the Echo and the Drake without a rejected action',
    async (_name, make) => {
      for (let seed = 0; seed < 5; seed += 1) {
        const g = scenario()
          .seat(0)
          .hand(ECHO, BOLT)
          .battlefield('Island', { count: 4 })
          .battlefield('Mountain', { count: 4 })
          .battlefield(DRAKE)
          .commander(COMMANDER, { casts: 2 })
          .library(BOLT, ...LIBRARY)
          .seat(1)
          .library(...LIBRARY)
          .at('precombatMain')
          .build();
        await play(g, make());
        g.expect.invariants();
      }
    },
  );
});

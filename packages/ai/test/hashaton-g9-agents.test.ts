// The agents and group 9 of the Hashaton deck (D-1180 to D-1185, provisional, SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g9.ts`): an activated ability with a Phyrexian
// symbol in its cost, a transforming creature, the exile of a random card from a hand, and the damage trigger that then offers to put a land card onto the battlefield or to cast a spell
// for free. They ask no new kind of question: the activation is an ordinary `activate` (its payment the `payMana` decision of every cost, with 2 life for the Phyrexian symbol), the
// land is a `confirmOptional`, the free cast a `chooseCards` of purpose `cast` and then the questions of the spell cast. Each agent is checked on real engine states: every answer is
// one the engine lists and accepts, and whole turns with the cards finish without a rejected action.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal, sameAction } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 8 }, () => 'Island');
const SCRIBE = 'SYNTHETIC Phyrexian Scribe';
const SEER = 'SYNTHETIC Phyrexian Seer // Phyrexian Colossus';
const POINTER = 'SYNTHETIC Chaos Pointer';
const OBLITERATOR = 'SYNTHETIC Chaos Obliterator';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const FOREST = 'Forest';
const DIVINATION = 'Divination';

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** The opponent hits the Obliterator with a Bolt; its trigger resolves with `exiled` as the only card left in their hand, and the first offer is asked. */
function atOffer(exiled: string): ScenarioGame {
  const g = scenario()
    .seed(4)
    .seat(0)
    .battlefield(OBLITERATOR)
    .library(...LIBRARY)
    .seat(1)
    .hand(BOLT, exiled)
    .battlefield('Mountain')
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).pass();
  g.act(1).cast(`${BOLT}[0]`, { targets: [OBLITERATOR], pay: true });
  g.passAll();
  return g;
}

describe('the offer to put the land onto the battlefield', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atOffer(FOREST);
    g.expect.pending('confirmOptional', 0);
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atOffer(FOREST);
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });
});

describe('the offer to cast the exiled card without paying', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atOffer(BEARS);
    g.expect.pending('chooseCards', 0);
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atOffer(BEARS);
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });
});

describe('the activation with a Phyrexian symbol', () => {
  /** The Scribe with no black mana but plenty of life: the activation is on offer, and paid with 2 life. */
  function withScribe(): ScenarioGame {
    return scenario()
      .seat(0)
      .battlefield(SCRIBE)
      .battlefield('Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
  }

  test('the engine lists the activation, and each agent answers with a listed action', async () => {
    for (const [, make] of agents) {
      const g = withScribe();
      expect(
        getLegalActions(g.state, 0).some(
          (a) => a.kind === 'activate' && g.state.objects[a.object]?.zone === 'battlefield',
        ),
      ).toBe(true);
      expectLegal(g, await answer(g, make()));
    }
    const g = withScribe();
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });
});

describe('whole turns by the agents', () => {
  const play = async (g: ScenarioGame, agent: { decide: CasualAgent['decide'] }) => {
    for (let i = 0; i < 120 && g.state.pending !== null && g.state.result === null; i += 1) {
      const decision = g.state.pending;
      const view = g.view(decision.seat);
      if (view.pending === null) break;
      const a = await agent.decide(view, view.pending, { budgetMs: 1000, now: () => 0 });
      // The list of a declaration of attackers, blockers or damage is a sample of the declarations the engine accepts (none, each one alone, all): the engine itself refuses a
      // declaration that is not legal (`choose` throws), which is the check for those.
      const sampled = ['declareAttackers', 'declareBlockers', 'assignDamage'].includes(
        decision.kind,
      );
      if (!sampled) {
        expect(getLegalActions(g.state, decision.seat).some((x) => sameAction(x, a))).toBe(true);
      }
      g.choose(decision.seat, a);
    }
  };

  test.each(agents)(
    'the %s agent plays turns with the cards, the Bolt and a hand to exile from, without a rejected action',
    async (_name, make) => {
      for (let seed = 0; seed < 5; seed += 1) {
        const g = scenario()
          .seed(seed)
          .seat(0)
          .battlefield(SCRIBE)
          .battlefield(SEER)
          .battlefield(POINTER)
          .battlefield(OBLITERATOR)
          .battlefield('Plains', { count: 6 })
          .battlefield('Swamp', { count: 2 })
          .library(DIVINATION, ...LIBRARY)
          .seat(1)
          .hand(BOLT, BEARS, FOREST, DIVINATION)
          .battlefield('Mountain', { count: 3 })
          .library(...LIBRARY)
          .at('precombatMain')
          .build();
        await play(g, make());
        g.expect.invariants();
      }
    },
  );
});

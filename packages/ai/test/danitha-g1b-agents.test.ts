// The agents and group 1b of the Danitha deck (D-400 to D-404 provisional, SYNTHETIC cards of the engine fixtures `synthetic-danitha-g1b.ts`): an instant that chooses a card of the
// graveyard and offers to put it onto the battlefield (a plain `confirmOptional` in the middle of a resolution, then the `choosePermanent` of purpose `auraHost` for an Aura card), a
// creature that lets its controller cast an Aura or Equipment spell from the graveyard (an ordinary `castSpell` among the legal actions, with the targets an Aura asks for), an Aura with
// protection from creatures and an enchantment that scries and draws. They ask no new kind of question. Each agent is checked on real engine states: every answer is one the engine
// lists and accepts, the casual agent takes the free card on the battlefield, and whole turns with the cards finish without a rejected action.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal, sameAction } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 10 }, () => 'Island');
const RITE = 'SYNTHETIC Rebirth Rite';
const RECALLER = 'SYNTHETIC Aura Recaller';
const WARD_AURA = 'SYNTHETIC Creature Ward Aura';
const WATCHER = 'SYNTHETIC Growth Watcher';
const MIGHT_AURA = 'SYNTHETIC Might Aura';
const BLADE = 'SYNTHETIC Blade';
const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 3/3';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** The Rite is on the stack and resolving for `target` of the graveyard; the offer is the pending decision (when the card is of mana value 3 or less). */
function atOffer(target: string, field: readonly string[] = []): ScenarioGame {
  const g = scenario()
    .seed(4)
    .seat(0)
    .hand(RITE)
    .battlefield('Forest', 'Plains', 'Plains', ...field)
    .graveyard(target)
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(RITE, { targets: [target], pay: true });
  g.passAll();
  return g;
}

describe('the offer to put the chosen card onto the battlefield', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atOffer(BEARS);
    g.expect.pending('confirmOptional', 0);
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atOffer(BEARS);
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });

  test('the casual agent puts a card of mana value 3 or less onto the battlefield: a free permanent beats a card in the hand', async () => {
    const g = atOffer(BEARS);
    const action = await answer(g, new CasualAgent({ seed: 3 }));
    expect(action).toEqual({ kind: 'acceptOptional' });
    g.choose(0, action);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('a card of mana value 4 is not offered: it goes into the hand and the agent has nothing to answer', async () => {
    const g = atOffer(SPIDER);
    g.expect.pending('priority', 0);
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
  });
});

describe('an Aura card put onto the battlefield asks what it enchants (CR 303.4f)', () => {
  /** The offer is accepted; the Aura asks which of two creatures it enchants. */
  function atHost(): ScenarioGame {
    const g = atOffer(MIGHT_AURA, [BEARS, VANILLA]);
    g.act(0).accept();
    g.expect.pending('choosePermanent', 0);
    return g;
  }

  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atHost();
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atHost();
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });
});

describe('Auras and Equipment cast from the graveyard', () => {
  const withRecaller = () =>
    scenario()
      .seed(2)
      .seat(0)
      .battlefield(RECALLER, BEARS, 'Forest', 'Plains', 'Plains', 'Plains')
      .graveyard(MIGHT_AURA, BLADE)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the engine lists the casts from the graveyard, and each agent answers with a listed action', async () => {
    for (const [, make] of agents) {
      const g = withRecaller();
      const legal = getLegalActions(g.state, 0);
      expect(
        legal.some(
          (a) => a.kind === 'castSpell' && g.state.objects[a.object]?.zone === 'graveyard',
        ),
      ).toBe(true);
      expectLegal(g, await answer(g, make()));
    }
    const g = withRecaller();
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });
});

describe('whole turns by the agents', () => {
  const play = async (g: ScenarioGame, agent: { decide: CasualAgent['decide'] }) => {
    for (let i = 0; i < 160 && g.state.pending !== null && g.state.result === null; i += 1) {
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

  const agentsWithHeuristic: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
    ...agents,
    ['heuristic', () => new HeuristicAgent({ seed: 3 })],
  ];

  test.each(agentsWithHeuristic)(
    'the %s agent plays turns with the cards, an Aura and an Equipment in the graveyard and a spell that targets its creature, without a rejected action',
    async (_name, make) => {
      for (let seed = 0; seed < 5; seed += 1) {
        const g = scenario()
          .seed(seed)
          .seat(0)
          .battlefield(RECALLER)
          .battlefield(WATCHER)
          .battlefield(BEARS)
          .battlefield('Plains', { count: 4 })
          .battlefield('Forest', { count: 3 })
          .battlefield('Mountain', { count: 1 })
          .hand(RITE, WARD_AURA, BOLT)
          .graveyard(MIGHT_AURA, BLADE, SPIDER, BEARS)
          .library(...LIBRARY)
          .seat(1)
          .battlefield(VANILLA)
          .hand(BOLT)
          .battlefield('Mountain', { count: 2 })
          .library(...LIBRARY)
          .at('precombatMain')
          .build();
        await play(g, make());
        g.expect.invariants();
      }
    },
    // A game of this kind is slow under load: an explicit timeout, not fewer seeds.
    120_000,
  );
});

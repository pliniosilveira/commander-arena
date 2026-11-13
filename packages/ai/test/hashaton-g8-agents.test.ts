// The agents and group 8 of the Hashaton deck (D-358 to D-361, SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g8.ts`): "Choose two target creature cards in
// your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.", a loot with a conditional drain, and "You may cast target instant or
// sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead." ask no new kind of question: targets (`targets`), a
// permanent to sacrifice (`choosePermanent`), a card to discard (`chooseCards`), and then an ordinary cast from the graveyard that the engine lists. Each agent is checked on
// real engine states: every answer is one the engine lists and accepts, and whole turns with the cards finish without a rejected action.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal, sameAction } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 8 }, () => 'Island');
const EXCHANGE = 'SYNTHETIC Grim Exchange';
const LOOTER = 'SYNTHETIC Spell Looter';
const REAVER = 'SYNTHETIC Spell Reaver';
const BEARS = 'Grizzly Bears';
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const ELVES = 'Llanowar Elves';
const CUB = 'SYNTHETIC Quiet Cub';
const BOLT = 'Lightning Bolt';
const DIVINATION = 'Divination';

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** Victimize's shape is cast with two creature cards chosen and two creatures to sacrifice from: the sacrifice is asked. */
function atSacrifice(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .hand(EXCHANGE)
    .battlefield('Swamp', { count: 3 })
    .battlefield(ELVES)
    .battlefield(CUB)
    .graveyard(BEARS, ZOMBIE)
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast(EXCHANGE, { targets: [BEARS, ZOMBIE], pay: true });
  g.passAll();
  g.expect.pending('choosePermanent', 0);
  return g;
}

/** The looter is activated with an instant and a land in hand: the discard is asked. */
function atDiscard(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .battlefield(LOOTER)
    .hand(BOLT, 'Island')
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).activate(LOOTER);
  g.passAll();
  g.expect.pending('chooseCards', 0);
  return g;
}

/** The reaver is sacrificed for the permission and the ability resolved: the instant in the graveyard is castable. */
function afterPermission(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .battlefield(REAVER)
    .battlefield('Mountain', { count: 3 })
    .graveyard(BOLT)
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).activate(REAVER, { targets: [BOLT], pay: true });
  g.passAll();
  return g;
}

describe('the sacrifice of the return spell', () => {
  test.each(agents)('the %s agent chooses a creature that the engine lists', async (_n, make) => {
    const g = atSacrifice();
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent chooses a creature that the engine lists', async () => {
    const g = atSacrifice();
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });
});

describe('the targets of the return spell', () => {
  test.each(agents)('the %s agent finds a cast of the spell the engine lists', async (_n, make) => {
    const g = scenario()
      .seat(0)
      .hand(EXCHANGE)
      .battlefield('Swamp', { count: 3 })
      .battlefield(ELVES)
      .graveyard(BEARS, ZOMBIE)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    const a = await answer(g, make());
    expectLegal(g, a);
  });
});

describe('the discard of the loot', () => {
  test.each(agents)('the %s agent chooses a card that the engine lists', async (_n, make) => {
    const g = atDiscard();
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent chooses a card that the engine lists', async () => {
    const g = atDiscard();
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });
});

describe('the permission to cast from the graveyard', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = afterPermission();
    expect(
      getLegalActions(g.state, 0).some(
        (a) => a.kind === 'castSpell' && g.state.objects[a.object]?.zone === 'graveyard',
      ),
    ).toBe(true);
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = afterPermission();
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });
});

describe('whole turns by the agents', () => {
  const play = async (g: ScenarioGame, agent: { decide: CasualAgent['decide'] }) => {
    for (let i = 0; i < 80 && g.state.pending !== null && g.state.result === null; i += 1) {
      const decision = g.state.pending;
      const view = g.view(decision.seat);
      if (view.pending === null) break;
      const a = await agent.decide(view, view.pending, { budgetMs: 1000, now: () => 0 });
      expect(getLegalActions(g.state, decision.seat).some((x) => sameAction(x, a))).toBe(true);
      g.choose(decision.seat, a);
    }
  };

  test.each(agents)(
    'the %s agent plays a turn with the three kinds of cards without a rejected action',
    async (_name, make) => {
      for (let seed = 0; seed < 5; seed += 1) {
        const g = scenario()
          .seat(0)
          .hand(EXCHANGE, BOLT, DIVINATION)
          .battlefield(LOOTER)
          .battlefield(REAVER)
          .battlefield(ELVES)
          .battlefield('Swamp', { count: 3 })
          .battlefield('Mountain', { count: 3 })
          .battlefield('Island', { count: 3 })
          .graveyard(BEARS, ZOMBIE, BOLT)
          .library(DIVINATION, ...LIBRARY)
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

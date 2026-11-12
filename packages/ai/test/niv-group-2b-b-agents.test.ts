// The agents and group 2b-b of the Niv-Mizzet deck (D-327 to D-330, SYNTHETIC cards of the engine fixtures `synthetic-niv-group-2b-b.ts`): a card milled by
// "Mill a card. You may play that card this turn." is cast or played from the graveyard with the ordinary actions (`castSpell`, `playLand`), and the copy
// that mana of the artifact makes asks the ordinary question about the new targets. No new kind of question exists, so each agent is checked on real engine
// states: every answer is one the engine lists and accepts, and the cards are used.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal, sameAction } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');
const RITE = 'SYNTHETIC Mill Rite';
const GOGGLES = 'SYNTHETIC Mirror Goggles';
const BOLT = 'Lightning Bolt';

const milled = (top: string) => {
  const g = scenario()
    .seat(0)
    .hand(RITE)
    .battlefield('Mountain', 'Mountain', 'Mountain')
    .library(top, ...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast(RITE, { pay: true });
  g.passAll();
  return g;
};

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

describe('a card in the graveyard that an effect lets the player play', () => {
  test('the cast and the land play are among the legal actions, and the engine accepts them', () => {
    const spell = milled(BOLT);
    const cast = getLegalActions(spell.state, 0).filter((a) => a.kind === 'castSpell');
    expect(cast.some((a) => a.kind === 'castSpell' && a.object === spell.id(BOLT))).toBe(true);
    for (const a of cast) expect(applyAction(spell.state, 0, a).ok).toBe(true);

    const land = milled('Forest');
    const plays = getLegalActions(land.state, 0).filter((a) => a.kind === 'playLand');
    expect(plays.some((a) => a.kind === 'playLand' && a.object === land.id('Forest'))).toBe(true);
    for (const a of plays) expect(applyAction(land.state, 0, a).ok).toBe(true);
  });

  test.each(agents)('the %s agent answers with an action the engine lists', async (_name, make) => {
    for (const top of [BOLT, 'Forest']) {
      const g = milled(top);
      const a = await answer(g, make());
      expectLegal(g, a);
    }
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    for (const top of [BOLT, 'Forest']) {
      const g = milled(top);
      const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
      expectLegal(g, a);
    }
  });

  test('the casual agent uses the card: it plays the milled land or casts the milled spell before passing', async () => {
    const land = milled('Forest');
    expect(await answer(land, new CasualAgent({ seed: 1 }))).toEqual(
      expect.objectContaining({ kind: 'playLand', object: land.id('Forest') }),
    );
    const spell = milled(BOLT);
    const a = await answer(spell, new CasualAgent({ seed: 1 }));
    expect(a).toEqual(expect.objectContaining({ kind: 'castSpell', object: spell.id(BOLT) }));
  });
});

describe('the copy of a spell that mana of the artifact makes', () => {
  const copied = () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield(GOGGLES)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    return g;
  };

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
    const a: Action = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
    expect(getLegalActions(g.state, 0).some((x) => sameAction(x, a))).toBe(true);
  });
});

describe('whole turns by the agents', () => {
  const play = async (g: ScenarioGame, agent: { decide: CasualAgent['decide'] }) => {
    for (let i = 0; i < 40 && g.state.pending !== null && g.state.result === null; i += 1) {
      const decision = g.state.pending;
      const view = g.view(decision.seat);
      if (view.pending === null) break;
      const a = await agent.decide(view, view.pending, { budgetMs: 1000, now: () => 0 });
      expect(getLegalActions(g.state, decision.seat).some((x) => sameAction(x, a))).toBe(true);
      g.choose(decision.seat, a);
    }
  };

  test.each(agents)(
    'the %s agent plays a hand of the cards without a rejected action',
    async (_name, make) => {
      for (let seed = 0; seed < 5; seed += 1) {
        const g = scenario()
          .seat(0)
          .hand(RITE, BOLT)
          .battlefield('Mountain', 'Mountain', 'Mountain', GOGGLES)
          .library(BOLT, 'Forest', ...LIBRARY)
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

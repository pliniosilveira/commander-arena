// Every agent answers the question of the order of the replacement effects of a destruction (CR 616.1, D-418, `chooseOption` with purpose 'replacement' and a `destroy`: a
// regeneration shield and the Umbra armor of an Aura) with an option the engine lists and accepts, on real engine states built with the scenario DSL and the SYNTHETIC Auras of the
// engine's `synthetic-danitha-g4.ts`. The casual and greedy agents take the first option (the default order: the shield first), the heuristic agent takes the effect that costs no Aura
// and otherwise the first, the random agent picks among the options.
import {
  type Action,
  applyAction,
  type ChooseOptionDecision,
  getLegalActions,
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

const TROLL = 'SYNTHETIC Regenerating Troll';
const VEIL = 'SYNTHETIC Umbra Veil';
const HIDE = 'SYNTHETIC Umbra Hide';
const BEARS = 'Grizzly Bears';
const MURDER = 'Murder';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

/** Seat 0 (the agent) has a Troll with a regeneration shield and an Umbra Aura; seat 1 casts Murder on it. */
function shieldAndAura(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(TROLL, 'Swamp', 'Swamp')
    .battlefield(VEIL, { attachedTo: TROLL })
    .seat(1)
    .library(...LIBRARY)
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .hand(MURDER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).activate(TROLL, { pay: true });
  g.passAll();
  g.act(0).pass();
  g.act(1).cast(MURDER, { targets: [TROLL], pay: true });
  g.passAll();
  g.expect.pending('chooseOption', 0);
  return g;
}

/** Seat 0 has a Bears with two Umbra Auras; seat 1 casts Murder on it. */
function twoAuras(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(BEARS)
    .battlefield(VEIL, { attachedTo: BEARS })
    .battlefield(HIDE, { attachedTo: BEARS })
    .seat(1)
    .library(...LIBRARY)
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .hand(MURDER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).pass();
  g.act(1).cast(MURDER, { targets: [BEARS], pay: true });
  g.passAll();
  g.expect.pending('chooseOption', 0);
  return g;
}

async function decide(g: ScenarioGame, agent: Agent): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action) {
  expect(
    getLegalActions(g.state, 0).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, 0, action).ok).toBe(true);
}

const question = (g: ScenarioGame): ChooseOptionDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error('no chooseOption decision');
  return d;
};

const agents: readonly [string, () => Agent][] = [
  ['casual', () => new CasualAgent({ seed: 5 })],
  ['greedy', () => new GreedyAgent({ seed: 5 })],
  ['heuristic', () => new HeuristicAgent({ seed: 5 })],
  ['random', () => new RandomLegalAgent({ seed: 5 })],
];

describe('the question is asked of the controller of the creature and answered by every agent', () => {
  test.each(agents)('%s: a legal answer for a shield and an Umbra Aura', async (_name, make) => {
    const g = shieldAndAura();
    const a = await decide(g, make());
    expect(a.kind).toBe('chooseOption');
    expectLegal(g, a);
  });

  test.each(agents)('%s: a legal answer for two Umbra Auras', async (_name, make) => {
    const g = twoAuras();
    const a = await decide(g, make());
    expect(a.kind).toBe('chooseOption');
    expectLegal(g, a);
  });

  test('the casual and greedy agents take the first option, the default order: the shield first', async () => {
    for (const make of [() => new CasualAgent({ seed: 5 }), () => new GreedyAgent({ seed: 5 })]) {
      const g = shieldAndAura();
      const d = question(g);
      expect(d.options[0]).toBe('regenerate');
      expect(await decide(g, make())).toEqual({ kind: 'chooseOption', option: d.options[0] });
    }
  });

  test('the heuristic agent takes the effect that costs no Aura, the shield; with two Auras the first, the oldest', async () => {
    const g = shieldAndAura();
    expect(await decide(g, new HeuristicAgent({ seed: 5 }))).toEqual({
      kind: 'chooseOption',
      option: 'regenerate',
    });
    const h = twoAuras();
    expect(await decide(h, new HeuristicAgent({ seed: 5 }))).toEqual({
      kind: 'chooseOption',
      option: question(h).options[0],
    });
  });

  test('the random agent answers with an option, whichever the seed', async () => {
    const g = shieldAndAura();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const a = await decide(g, new RandomLegalAgent({ seed }));
      expectLegal(g, a);
      if (a.kind === 'chooseOption') seen.add(a.option);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test('whatever the answer, the game goes on: the creature is not destroyed and priority comes back', async () => {
    for (const [, make] of agents) {
      const g = shieldAndAura();
      g.choose(0, await decide(g, make()));
      g.passAll();
      g.expect.zone(TROLL, 'battlefield', { seat: 0 });
      expect(g.state.pending?.kind).toBe('priority');
      g.expect.invariants();
    }
  });
});

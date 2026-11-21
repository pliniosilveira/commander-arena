// CasualAgent, HeuristicAgent and RandomLegalAgent answer "its controller chooses a player to be its protector" (CR 310.9a) with an option the engine lists and accepts, on a real
// three-seat engine state built with the scenario DSL and the SYNTHETIC battle of the engine's fixtures.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const BATTLE = 'SYNTHETIC Vanilla Battle';
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

/** Seat 0 has cast the battle; every seat passed and the spell resolved, so seat 0 is asked for the protector. */
function asked(): ScenarioGame {
  const g = scenario({ seats: 3 })
    .seat(0)
    .library(...LIBRARY)
    .hand(BATTLE)
    .battlefield('Mountain', 'Mountain', 'Mountain')
    .seat(1)
    .library(...LIBRARY)
    .seat(2)
    .library(...LIBRARY)
    .build();
  g.act(0).cast(BATTLE, { pay: true });
  g.passAll();
  return g;
}

async function decide(
  g: ScenarioGame,
  agent: CasualAgent | HeuristicAgent | RandomLegalAgent,
): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

describe('the protector of a battle', () => {
  test.each([
    ['casual', () => new CasualAgent({ seed: 1 })],
    ['heuristic', () => new HeuristicAgent({ seed: 1 })],
    ['random', () => new RandomLegalAgent({ seed: 1 })],
  ])('the %s agent answers with an option the engine accepts', async (_name, make) => {
    const g = asked();
    g.expect.pending('chooseOption', 0);
    const a = await decide(g, make());
    if (a.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${a.kind}`);
    expect(['seat:1', 'seat:2']).toContain(a.option);
    expect(getLegalActions(g.state, 0).some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(
      true,
    );
    expect(applyAction(g.state, 0, a).ok).toBe(true);
  });

  test('the casual agent takes the first opponent left', async () => {
    const a = await decide(asked(), new CasualAgent({ seed: 1 }));
    expect(a).toEqual({ kind: 'chooseOption', option: 'seat:1' });
  });
});

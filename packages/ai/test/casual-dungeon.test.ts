// CasualAgent, HeuristicAgent, GreedyAgent and RandomLegalAgent answer "which room do you move your venture marker into" (CR 701.49b, 309.5a; a `chooseOption` of purpose `dungeonRoom`) with
// an option the engine lists and accepts, on a real engine state built with the scenario DSL and the SYNTHETIC cards of the engine's fixtures. The casual agent picks the most useful room.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, GreedyAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const DELVE = 'SYNTHETIC Delve Into Undercity';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

/** Seat 0 has cast the venture sorcery from `room`, so it is asked which room to move into. */
function asked(room: 'secretEntrance' | 'lostWell' | 'forge', creature: boolean): ScenarioGame {
  let b = scenario().seat(0).life(20).hand(DELVE).battlefield('Swamp', { count: 3 }).dungeon(room);
  if (creature) b = b.battlefield('Grizzly Bears');
  const g = b
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain')
    .build();
  g.act(0).cast(DELVE, { pay: true });
  g.passAll();
  return g;
}

async function decide(
  g: ScenarioGame,
  agent: CasualAgent | GreedyAgent | HeuristicAgent | RandomLegalAgent,
): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

describe('the room chosen when two arrows leave the room', () => {
  test.each([
    ['casual', () => new CasualAgent({ seed: 1 })],
    ['greedy', () => new GreedyAgent({ seed: 1 })],
    ['heuristic', () => new HeuristicAgent({ seed: 1 })],
    ['random', () => new RandomLegalAgent({ seed: 1 })],
  ])('the %s agent answers with an option the engine accepts', async (_name, make) => {
    const g = asked('secretEntrance', true);
    g.expect.pending('chooseOption', 0);
    const a = await decide(g, make());
    if (a.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${a.kind}`);
    expect(['Forge', 'Lost Well']).toContain(a.option);
    expect(getLegalActions(g.state, 0).some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(
      true,
    );
    expect(applyAction(g.state, 0, a).ok).toBe(true);
  });

  test('with a creature to put the counters on the casual agent takes Forge, without one Lost Well', async () => {
    expect(await decide(asked('secretEntrance', true), new CasualAgent({ seed: 1 }))).toEqual({
      kind: 'chooseOption',
      option: 'Forge',
    });
    expect(await decide(asked('secretEntrance', false), new CasualAgent({ seed: 1 }))).toEqual({
      kind: 'chooseOption',
      option: 'Lost Well',
    });
  });

  test('from Forge the casual agent takes Trap! (five life) over Arena', async () => {
    expect(await decide(asked('forge', true), new CasualAgent({ seed: 1 }))).toEqual({
      kind: 'chooseOption',
      option: 'Trap!',
    });
  });

  test('from Lost Well the casual agent takes Arena or Stash, the better of the two', async () => {
    const a = await decide(asked('lostWell', false), new CasualAgent({ seed: 1 }));
    expect(a).toEqual({ kind: 'chooseOption', option: 'Arena' });
  });
});

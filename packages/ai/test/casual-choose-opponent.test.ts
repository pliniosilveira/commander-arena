// CasualAgent, HeuristicAgent and RandomLegalAgent answer "an opponent separates ..." with more than one opponent left (CR 608.2d, 801.5b: the controller chooses which opponent) with
// an option the engine lists and accepts, on a real three-seat engine state built with the scenario DSL and the SYNTHETIC card of the engine's fixtures.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const READING = 'SYNTHETIC Pile Reading';
const TOP = ['Grizzly Bears', 'Giant Spider', 'Serra Angel', 'Lightning Bolt', 'Sol Ring'];
const REST = Array.from({ length: 8 }, () => 'Plains');

/** Seat 0 has cast the card and the spell resolved, so seat 0 is asked which opponent separates. */
function asked(): ScenarioGame {
  const b = scenario({ seats: 3 }).seat(0).hand(READING).pool('UUUUUU');
  for (const name of [...TOP, ...REST]) b.library(name);
  const g = b
    .seat(1)
    .library(...REST)
    .seat(2)
    .library(...REST)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  g.act(0).cast(READING, { pay: true });
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

describe('the opponent chosen for "an opponent separates"', () => {
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

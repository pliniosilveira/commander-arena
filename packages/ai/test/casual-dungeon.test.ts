// CasualAgent, HeuristicAgent and RandomLegalAgent answer "which room does the venture marker move to" (CR 701.49b, 309.5a, `chooseOption` of purpose 'dungeonRoom') with an
// option the engine lists and accepts, on a real engine state built with the scenario DSL and the SYNTHETIC Undercity Dive; and the casual agent takes the room worth most.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const DIVE = 'SYNTHETIC Undercity Dive';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

/** Seat 0 ventures from `room`; the Dive resolved, so seat 0 is asked which room to move to. */
function asked(
  room: string,
  extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
): ScenarioGame {
  const g = extra(
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(DIVE)
      .battlefield('Island', 'Island')
      .inUndercity(room)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY),
  ).build();
  g.act(0).cast(DIVE, { pay: true });
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

describe('the room of a dungeon', () => {
  test.each([
    ['casual', () => new CasualAgent({ seed: 1 })],
    ['heuristic', () => new HeuristicAgent({ seed: 1 })],
    ['random', () => new RandomLegalAgent({ seed: 1 })],
  ])('the %s agent answers with an option the engine accepts', async (_name, make) => {
    const g = asked('secret-entrance');
    g.expect.pending('chooseOption', 0);
    const a = await decide(g, make());
    if (a.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${a.kind}`);
    expect(['forge', 'lost-well']).toContain(a.option);
    expect(getLegalActions(g.state, 0).some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(
      true,
    );
    expect(applyAction(g.state, 0, a).ok).toBe(true);
  });

  test('with no creature to put counters on the casual agent leaves Forge for the Lost Well', async () => {
    // Forge (counters on a creature) is worth nothing without one; the Lost Well (a scry) is worth something.
    const a = await decide(asked('secret-entrance'), new CasualAgent({ seed: 1 }));
    expect(a).toEqual({ kind: 'chooseOption', option: 'lost-well' });
  });

  test('with a creature of its own it takes Forge', async () => {
    const a = await decide(
      asked('secret-entrance', (b) => b.seat(0).battlefield('Grizzly Bears')),
      new CasualAgent({ seed: 1 }),
    );
    expect(a).toEqual({ kind: 'chooseOption', option: 'forge' });
  });

  test('from Forge it takes Trap! over a goad', async () => {
    const a = await decide(asked('forge'), new CasualAgent({ seed: 1 }));
    expect(a).toEqual({ kind: 'chooseOption', option: 'trap' });
  });

  test('from Arena it takes the Catacombs over Archives', async () => {
    const a = await decide(asked('arena'), new CasualAgent({ seed: 1 }));
    expect(a).toEqual({ kind: 'chooseOption', option: 'catacombs' });
  });
});

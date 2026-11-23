// The lethal checks of CasualAgent and GreedyAgent judge each opponent on its own life and poison,
// on a real three-seat engine state (scenario DSL, SYNTHETIC infect creatures).
import { applyAction } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, GreedyAgent } from '../src/index';
import { CTX } from './helpers';

const BEARS = 'Grizzly Bears';
const VIPER = 'SYNTHETIC Infect Viper'; // 1/1 infect

/** Seat 0 attacks; seat 1 and seat 2 have the given life and poison. */
function setup(mine: string[], s1: { life: number; poison: number }, s2: typeof s1): ScenarioGame {
  const g = scenario({ seats: 3 })
    .seat(0)
    .battlefield(...mine)
    .library('Island', { count: 4 })
    .seat(1)
    .life(s1.life)
    .poison(s1.poison)
    .library('Island', { count: 4 })
    .seat(2)
    .life(s2.life)
    .poison(s2.poison)
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

const agents = [
  ['casual', () => new CasualAgent({ seed: 1 })],
  ['greedy', () => new GreedyAgent({ seed: 1 })],
] as const;

async function attacks(g: ScenarioGame, make: () => CasualAgent | GreedyAgent) {
  const view = g.view(0);
  if (view.pending === null) throw new Error('no decision');
  const action = await make().decide(view, view.pending, CTX);
  expect(applyAction(g.state, 0, action).ok).toBe(true);
  if (action.kind !== 'declareAttackers') throw new Error(action.kind);
  return action.attacks.map((a) => (a.target.kind === 'player' ? a.target.seat : -1));
}

describe.each(agents)('%s lethal check names its seat', (_n, make) => {
  test("one opponent's life is not set against another's poison: the low-life seat is attacked", async () => {
    // 4 damage kills seat 2 (3 life); seat 1 (40 life, 9 poison) takes no poison from Bears.
    const g = setup([BEARS, BEARS], { life: 40, poison: 9 }, { life: 3, poison: 0 });
    expect(await attacks(g, make)).toEqual([2, 2]);
  });

  test('poison lethal is judged on the seat that is attacked, not the first one', async () => {
    // The Viper's one poison counter kills seat 2 (9 poison), not seat 1 (0 poison).
    const g = setup([VIPER], { life: 20, poison: 0 }, { life: 20, poison: 9 });
    expect(await attacks(g, make)).toEqual([2]);
  });

  test('the issue scenario: poison on seat 1 is lethal for seat 1 only', async () => {
    const g = setup([VIPER, BEARS], { life: 40, poison: 9 }, { life: 3, poison: 0 });
    expect(await attacks(g, make)).toEqual([1, 1]);
  });
});

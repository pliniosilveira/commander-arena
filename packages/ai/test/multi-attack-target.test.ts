// More opponents (issue 479): with three seats every agent aims the attack at the opponent it can
// kill (or the weakest one), not at the lowest-numbered seat. Real engine states from the scenario DSL.
import type { Action } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { rankOpponents } from '../src/attack-targets';
import { CasualAgent, GreedyAgent, HeuristicAgent } from '../src/index';
import { ctxFor } from './heuristic-helpers';

const SPIDER = 'Giant Spider'; // 2/4 reach: used as a plain attacker here, power 2

function threeSeats(lifes: [number, number], blockersAtSeat1 = 0) {
  let b = scenario({ seats: 3 })
    .seat(0)
    .battlefield(SPIDER, SPIDER)
    .library('Island', { count: 4 })
    .seat(1)
    .life(lifes[0]);
  for (let i = 0; i < blockersAtSeat1; i++) b = b.battlefield(SPIDER);
  const g = b
    .library('Island', { count: 4 })
    .seat(2)
    .life(lifes[1])
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

const agents = {
  casual: () => new CasualAgent({ seed: 1 }),
  greedy: () => new GreedyAgent({ seed: 1 }),
  heuristic: () => new HeuristicAgent({ seed: 1 }),
};

async function targetsOf(
  g: ReturnType<typeof threeSeats>,
  make: () => CasualAgent | GreedyAgent | HeuristicAgent,
) {
  const view = g.view(0);
  if (view.pending === null) throw new Error('no decision');
  const action: Action = await make().decide(view, view.pending, ctxFor(g));
  if (action.kind !== 'declareAttackers') throw new Error('not an attack');
  return action.attacks.map((a) => (a.target.kind === 'player' ? a.target.seat : -1));
}

describe.each(Object.entries(agents))('%s agent with three seats', (_name, make) => {
  test('both attackers go at the opponent they can kill (seat 2 at 4 life, seat 1 at 40)', async () => {
    const g = threeSeats([40, 4]);
    expect(await targetsOf(g, make)).toEqual([2, 2]);
  });
});

describe('rankOpponents', () => {
  test('equal life: the opponent with fewer untapped creatures comes first; then the lowest seat', () => {
    const g = threeSeats([20, 20], 2);
    const view = g.view(0);
    const mine = view.battlefield.filter((o) => o.controller === 0);
    expect(rankOpponents(view, mine)).toEqual([2, 1]);
    const bare = threeSeats([20, 20], 0).view(0);
    expect(
      rankOpponents(
        bare,
        bare.battlefield.filter((o) => o.controller === 0),
      ),
    ).toEqual([1, 2]);
  });
});

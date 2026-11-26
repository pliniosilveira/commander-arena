// Response and removal target look-ahead (issue 653, step 6): a counterspell is cast or held by playing both
// to the end of the turn, and the top removal targets are played to the agent's next turn
// (`heuristic-response-look.ts`).
import type { Action, ChosenTarget } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { startBudget } from '../src/heuristic-budget';
import { lookAtCounter, targetsToLook } from '../src/heuristic-response-look';
import { HeuristicAgent, withWeights } from '../src/index';
import { nameOf } from './blunders/drive';
import { askHeuristic, creature, lastReason } from './heuristic-helpers';

const BEARS = 'Grizzly Bears'; // 1G, 2/2
const LIBRARY = { count: 10 } as const;
/** A 6/6 flying commander that costs {4}; cast once before, so 6 mana with the tax (CR 903.8). */
const DRAGON = creature('SYNTHETIC Dragon Commander 6/6', 6, 6, ['flying'], { cost: ['4'] });

/** The opponent casts Grizzly Bears and the agent, holding Counterspell, is asked; `forests` is the opponent's mana. */
function bearsOnTheStack(forests: number, withCommander: boolean) {
  let b = scenario().define(DRAGON);
  b = b
    .seat(0)
    .hand('Counterspell')
    .battlefield('Island', 'Island')
    .library('Island', LIBRARY)
    .seat(1);
  if (withCommander) b = b.commander(DRAGON.name, { casts: 1 });
  const g = b
    .hand(BEARS)
    .battlefield('Forest', { count: forests })
    .library('Island', LIBRARY)
    .at('precombatMain', { active: 1 })
    .build();
  g.act(1).cast(BEARS).pay();
  g.act(1).pass();
  return g;
}

describe('counter or hold', () => {
  test('the counterspell is held for the commander that follows, and the decision says it looked', async () => {
    const g = bearsOnTheStack(8, true);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toEqual({ kind: 'pass' });
    expect(lastReason(agent)?.reason).toBe('hold');
    expect(agent.searches[0]?.look?.changed).toBe(true);
    expect(agent.searches[0]?.look?.playOuts).toBe(2);
  });

  test('the counterspell is cast at the Bears when nothing bigger can follow', async () => {
    // Two Forests pay for the Bears and nothing else; the commander is not in this game.
    const g = bearsOnTheStack(2, false);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id('Counterspell') });
    expect(lastReason(agent)?.reason).toBe('counter');
    expect(agent.searches[0]?.look?.changed).toBe(false);
  });

  test('the commander that cannot be paid for this turn is no reason to hold: two Forests are left after the Bears', async () => {
    // Four Forests: the Bears take two, the commander at {4} plus the tax of {2} needs six.
    const g = bearsOnTheStack(4, true);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id('Counterspell') });
  });

  test('without a sample the rule counters, with no look', async () => {
    const g = bearsOnTheStack(8, true);
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent, { withSample: false });
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id('Counterspell') });
    expect(agent.searches[0]?.look).toBeUndefined();
  });

  test('a margin larger than any difference counters as the rule does', async () => {
    const g = bearsOnTheStack(8, true);
    const agent = new HeuristicAgent({
      seed: 1,
      weights: withWeights({ main: { counterLookMargin: 1000 } }),
    });
    const action = await askHeuristic(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id('Counterspell') });
    expect(agent.searches[0]?.look?.changed).toBe(false);
  });

  test('a budget that cannot play both choices keeps the rule: the counterspell is cast', () => {
    const g = bearsOnTheStack(8, true);
    const seat = g.deciding;
    const view = g.view(seat);
    const agent = new HeuristicAgent({ seed: 1 });
    const budget = startBudget({ budgetMs: 5000, now: () => 0 }, { budget: 1, limit: 2 });
    const cast: Action = { kind: 'castSpell', object: g.id('Counterspell') };
    const looked = lookAtCounter(
      view,
      cast,
      {
        budget,
        weights: agent.weights,
        draw: () => 0,
        sample: () => undefined,
      },
      undefined,
      () => cast,
    );
    expect(looked).toBeNull();
  });
});

describe('removal targets', () => {
  test('the margin keeps today first and at most two others', () => {
    expect(targetsToLook([10, 9, 8, 7, 1], 4)).toEqual([0, 1, 2]);
    expect(targetsToLook([10, 1], 4)).toEqual([0]);
    expect(targetsToLook([], 4)).toEqual([]);
  });

  // The wall has the higher value (1 + 0.6 * 9), the 4/1 is what kills a player at 4 life next turn.
  const WALL = creature('SYNTHETIC Wall 0/9', 0, 9);
  const RAIDER = creature('SYNTHETIC Raider 4/1', 4, 1);

  function raiderAndWall(life: number) {
    return scenario()
      .define(WALL)
      .define(RAIDER)
      .seat(0)
      .life(life)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .landsPlayed(1)
      .library('Island', LIBRARY)
      .seat(1)
      .battlefield(WALL.name, RAIDER.name)
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  }

  async function murderTarget(life: number, weights = new HeuristicAgent({ seed: 1 }).weights) {
    const g = raiderAndWall(life);
    const agent = new HeuristicAgent({ seed: 1, weights });
    // The planner would hold Murder for the raider's attack; the cast is made here, so the targets are the look-ahead's.
    g.choose({ kind: 'castSpell', object: g.id('Murder') });
    const picked = await askHeuristic(g, agent);
    if (picked.kind !== 'chooseTargets') throw new Error(`chooseTargets expected: ${picked.kind}`);
    const t: ChosenTarget | undefined = picked.targets[0];
    return { name: t?.kind === 'object' ? nameOf(g, t.id) : '?', agent };
  }

  test('at 5 life Murder goes at the 4/1 that hits for 4 next turn, not the bigger wall', async () => {
    // Wrong to take the wall: it deals no damage, and the 4/1 takes a player at 5 with no blocker to 1 life.
    const got = await murderTarget(5);
    expect(got?.name).toBe(RAIDER.name);
    expect(got?.agent.searches.find((s) => s.look !== undefined)?.look?.changed).toBe(true);
  });

  test('at 40 life the same Murder keeps today target, the bigger body', async () => {
    const got = await murderTarget(40);
    expect(got?.name).toBe(WALL.name);
  });

  test('a margin of 0 looks at no other target: the wall is chosen at 5 life', async () => {
    const got = await murderTarget(5, withWeights({ removal: { lookMargin: 0 } }));
    expect(got?.name).toBe(WALL.name);
  });
});

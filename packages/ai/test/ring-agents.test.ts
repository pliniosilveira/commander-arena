// Every agent answers the question of the Ring (CR 701.54a, D-196: `choosePermanent` with purpose 'ringBearer', asked when the Ring tempts a player who
// controls two or more creatures) with a creature the engine lists and accepts, on real engine states built with the scenario DSL and the SYNTHETIC
// cards of the engine's `synthetic-ring.ts`. The casual and greedy agents take the creature with the most power (the first of the list on a tie), the
// heuristic agent weighs what the designation adds (the opposing creatures it keeps from blocking, keywords that help it connect, toughness), the
// random agent picks one of the creatures.
import {
  type Action,
  applyAction,
  type ChoosePermanentDecision,
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
import { askHeuristic } from './heuristic-helpers';

const RITE = 'SYNTHETIC Ring Rite';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const SERRA = 'Serra Angel'; // 4/4 flying, vigilance
const WALL = 'Wall of Stone';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

/** Seat 0 cast the Ring Rite with `mine` on the battlefield; the question is asked of seat 0. */
function temptation(mine: readonly string[], theirs: readonly string[] = []): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(RITE)
    .battlefield('Swamp', 'Swamp', ...mine)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...theirs)
    .at('precombatMain')
    .build();
  g.act(0).cast(RITE, { pay: true });
  g.passAll();
  g.expect.pending('choosePermanent', 0);
  return g;
}

const question = (g: ScenarioGame): ChoosePermanentDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent' || d.purpose !== 'ringBearer') {
    throw new Error('no Ring-bearer decision');
  }
  return d;
};

async function decide(g: ScenarioGame, agent: Agent): Promise<Action> {
  const seat = g.deciding;
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

/** The name of the creature an answer chooses. */
const chosen = (g: ScenarioGame, action: Action): string | undefined =>
  action.kind === 'choosePermanents'
    ? g.view(0).battlefield.find((o) => o.id === action.objects[0])?.name
    : undefined;

const agents: readonly [string, () => Agent][] = [
  ['casual', () => new CasualAgent({ seed: 3 })],
  ['greedy', () => new GreedyAgent({ seed: 3 })],
  ['heuristic', () => new HeuristicAgent({ seed: 3 })],
  ['random', () => new RandomLegalAgent({ seed: 3 })],
];

describe('every agent chooses a Ring-bearer the engine accepts', () => {
  test.each(agents)('%s: exactly one of the creatures it controls', async (_name, make) => {
    const g = temptation([V22, V33, V55], [WALL]);
    const a = await decide(g, make());
    expect(a.kind).toBe('choosePermanents');
    if (a.kind !== 'choosePermanents') return;
    expect(a.objects).toHaveLength(1);
    expect(question(g).legal).toContain(a.objects[0]);
    expect(getLegalActions(g.state, 0).some((x) => JSON.stringify(x) === JSON.stringify(a))).toBe(
      true,
    );
    const out = applyAction(g.state, 0, a);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.state.seats[0]?.ring?.tempted).toBe(1);
  });
});

describe('the casual and greedy agents take the creature with the most power', () => {
  test.each([
    ['casual', () => new CasualAgent({ seed: 3 })],
    ['greedy', () => new GreedyAgent({ seed: 3 })],
  ] as const)('%s', async (_name, make) => {
    const g = temptation([V22, V55, V33]);
    expect(chosen(g, await decide(g, make()))).toBe(V55);
  });

  test('the first creature the engine lists wins a tie', async () => {
    const g = temptation([V33, V33]);
    const a = await decide(g, new CasualAgent({ seed: 3 }));
    expect(a).toEqual({ kind: 'choosePermanents', objects: [question(g).legal[0]] });
  });

  test('a creature with more power wins over a creature with evasion', async () => {
    const g = temptation([V55, SERRA]);
    expect(chosen(g, await decide(g, new CasualAgent({ seed: 3 })))).toBe(V55);
  });
});

describe('the heuristic agent weighs what the designation adds', () => {
  test('a flying creature over a bigger one without evasion', async () => {
    const g = temptation([V33, SERRA], [V22]);
    expect(chosen(g, await askHeuristic(g))).toBe(SERRA);
  });

  test('a creature that opposing creatures with greater power can no longer block over one nothing is bigger than', async () => {
    // Against a 5/5 the 3/3 gets the evasion; the 5/5 of the agent is not blocked by anything bigger anyway.
    const g = temptation([V33, V22], [V55, V55]);
    expect(chosen(g, await askHeuristic(g))).toBe(V33);
  });

  test('the answer is the same each time (deterministic)', async () => {
    const first = await askHeuristic(temptation([V22, V33, V55], [WALL]));
    const second = await askHeuristic(temptation([V22, V33, V55], [WALL]));
    expect(second).toEqual(first);
  });
});

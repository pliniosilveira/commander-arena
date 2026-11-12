// Every agent answers the question of soulbond (CR 702.95a, D-984: `choosePermanent` with purpose 'soulbond', min 0, asked when a creature with soulbond enters and the agent
// controls another unpaired creature, or when another creature enters) with an answer the engine lists and accepts, on real engine states built with the scenario DSL and the
// SYNTHETIC cards of the engine's `synthetic-soulbond.ts`. The casual, greedy and heuristic agents always pair, with the creature with the most power, then the most toughness, the
// first listed on a tie; the random agent picks none or one of the creatures. A `soulbond` decision must never reach the fallback of the other optional choices
// (`chooseAnyNumberToSacrifice`), which would pair only tokens.
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

const SQUIRE = 'SYNTHETIC Soulbound Squire';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const WALL = 'Wall of Stone'; // 0/8
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

/** Seat 0 cast the Squire with `mine` on the battlefield; the question is asked of seat 0. */
function bond(mine: readonly string[], theirs: readonly string[] = []): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(SQUIRE)
    .battlefield('Plains', 'Plains', ...mine)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...theirs)
    .at('precombatMain')
    .build();
  g.act(0).cast(SQUIRE, { pay: true });
  g.passAll(); // the Squire resolves and enters; its ability goes on the stack
  g.passAll(); // the ability resolves: the question
  g.expect.pending('choosePermanent', 0);
  return g;
}

const question = (g: ScenarioGame): ChoosePermanentDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent' || d.purpose !== 'soulbond') {
    throw new Error('no soulbond decision');
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

describe('every agent answers the soulbond question with an answer the engine accepts', () => {
  test.each(agents)('%s: none, or one of the creatures it may pair with', async (_name, make) => {
    const g = bond([V22, V33, V55], [WALL]);
    const a = await decide(g, make());
    expect(a.kind).toBe('choosePermanents');
    if (a.kind !== 'choosePermanents') return;
    expect(a.objects.length).toBeLessThanOrEqual(1);
    for (const id of a.objects) expect(question(g).legal).toContain(id);
    expect(getLegalActions(g.state, 0).some((x) => JSON.stringify(x) === JSON.stringify(a))).toBe(
      true,
    );
    const out = applyAction(g.state, 0, a);
    expect(out.ok).toBe(true);
    expect(g.state.pending?.kind).toBe('choosePermanent'); // the test's own state is not changed by the check above
  });

  test.each(agents)('%s: the same answer for the same state', async (_name, make) => {
    const a = await decide(bond([V22, V33, V55]), make());
    const b = await decide(bond([V22, V33, V55]), make());
    expect(a).toEqual(b);
  });
});

describe('the casual, greedy and heuristic agents always pair, with the strongest creature', () => {
  const always = agents.filter(([name]) => name !== 'random');

  test.each(always)('%s: the creature with the most power', async (_name, make) => {
    const g = bond([V22, V55, V33]);
    expect(chosen(g, await decide(g, make()))).toBe(V55);
  });

  test.each(always)('%s: the most toughness when the power is the same', async (_name, make) => {
    const g = bond([V22, WALL, V33]);
    // 3/3 beats 2/2 and the 0/8 wall by power.
    expect(chosen(g, await decide(g, make()))).toBe(V33);
    const h = bond([WALL]);
    expect(chosen(h, await decide(h, make()))).toBe(WALL);
  });

  test.each(always)('%s: a tie goes to the first creature listed', async (_name, make) => {
    const g = bond([V22, V22]);
    const a = await decide(g, make());
    expect(a.kind === 'choosePermanents' ? a.objects[0] : undefined).toBe(question(g).legal[0]);
  });

  test.each(always)('%s: a single candidate is paired, not declined', async (_name, make) => {
    const g = bond([V22]);
    const a = await decide(g, make());
    expect(a.kind === 'choosePermanents' ? a.objects : []).toHaveLength(1);
  });

  test.each(always)('%s: a creature of the opponent is never chosen', async (_name, make) => {
    const g = bond([V22], [V55]);
    expect(chosen(g, await decide(g, make()))).toBe(V22);
  });
});

describe('the second ability: another creature enters', () => {
  test.each(agents)('%s: pairs the creature that entered, or declines', async (_name, make) => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(V22)
      .battlefield('Plains', 'Plains', SQUIRE)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(V22, { pay: true });
    g.passAll();
    g.passAll();
    const d = question(g);
    expect(d.legal).toHaveLength(1);
    const a = await decide(g, make());
    expect(a.kind).toBe('choosePermanents');
    if (a.kind !== 'choosePermanents') return;
    for (const id of a.objects) expect(d.legal).toContain(id);
    expect(applyAction(g.state, 0, a).ok).toBe(true);
  });
});

// Selective deepening of the turn planner (issue 653, step 4): the lines close to the best are played one turn
// further (horizon 2) with two players, on the stretched bounds of the deepening phase, only when the work left
// covers one deep play-out, and their value is blended with the value at horizon 1.
import {
  type Action,
  createRng,
  determinize,
  type GameState,
  type GameView,
  handleDecision,
  type PendingDecision,
  type PriorityDecision,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { evaluate } from '../src/evaluate';
import {
  DEEP_FACTOR,
  DIRECT,
  HARD_SHARE,
  NO_BUDGET,
  SEARCH_SHARE,
  startBudget,
  type WorkBounds,
} from '../src/heuristic-budget';
import { choosePriorityHeuristic } from '../src/heuristic-main';
import { choosePlan } from '../src/heuristic-plan';
import {
  deepCandidates,
  deepen,
  lineValue,
  MAX_DEEP_LINES,
  type Scored,
} from '../src/heuristic-plan-deep';
import { mainLines } from '../src/heuristic-plan-lines';
import { type Line, playLine, type SimAgents } from '../src/heuristic-plan-sim';
import { PlanCounter } from '../src/heuristic-plan-work';
import { type Scenario, scenariosOf } from '../src/heuristic-threats';
import { HeuristicAgent } from '../src/index';
import { type AgentWeights, DEFAULT_WEIGHTS, withWeights } from '../src/weights';

const V2 = 'SYNTHETIC Vanilla 2/2';
const V3 = 'SYNTHETIC Vanilla 3/3';
const BEARS = 'Grizzly Bears';
const FORESTS = ['Forest', 'Forest', 'Forest', 'Forest', 'Forest'];
const UNBOUNDED: WorkBounds = { budget: 1e9, limit: 1e9 };

/** Seat 0 in its first main phase with two creatures to cast; each opponent (`seats`) has a library of bears. */
function position(seats = 2): ScenarioGame {
  let b = scenario({ seats })
    .seat(0)
    .hand(V2, V3)
    .battlefield(...FORESTS)
    .landsPlayed(1)
    .library('Island', { count: 10 })
    .seat(1)
    .library(BEARS, { count: 10 });
  if (seats > 2) b = b.seat(2).library(BEARS, { count: 10 });
  return b.at('precombatMain', { active: 0 }).build();
}

const agents: SimAgents = {
  start: () => {
    const inner = new Map<number, HeuristicAgent>();
    return (seat) => {
      const agent = inner.get(seat) ?? new HeuristicAgent({ seed: 7919 + seat });
      inner.set(seat, agent);
      return (v: GameView) => agent.decisionHandlers(v);
    };
  },
};

/** The planner on the first main phase of seat 0, with `weights` and a budget of `bounds`. */
function plan(
  g: ScenarioGame,
  weights: AgentWeights,
  bounds: WorkBounds = UNBOUNDED,
  again = false,
) {
  const view = g.view(0);
  const d = view.pending as PriorityDecision;
  const sample = determinize(g.state, 0, createRng(1));
  const helper = new HeuristicAgent({ seed: 1, weights });
  const answer = (v: GameView, pending: PendingDecision): Action =>
    handleDecision(pending, helper.decisionHandlers(v));
  const budget = startBudget({ budgetMs: 5000, now: () => 0 }, bounds);
  const resample = again ? { resample: () => determinize(g.state, 0, createRng(2)) } : {};
  const think = { budget, weights, draw: () => 0, sample: () => sample, ...resample };
  const today = choosePriorityHeuristic(view, d, think, new Set(), answer);
  const lines = mainLines(view, d, 'main1', today, new Set(), weights);
  const planning = choosePlan(view, 'main1', lines, think, agents);
  return { planning, lines, budget, sample };
}

describe('the weights of the deepening', () => {
  test('are in the plan weights, and a blend of 0 is a weight the benchmark can set', () => {
    expect(DEFAULT_WEIGHTS.plan.deepMargin).toBeGreaterThan(0);
    expect(DEFAULT_WEIGHTS.plan.deepBlend).toBeGreaterThan(0);
    expect(DEFAULT_WEIGHTS.plan.deepBlend).toBeLessThanOrEqual(1);
    expect(withWeights({ plan: { deepBlend: 0 } }).plan.deepBlend).toBe(0);
  });

  test('the share of the second sample is in [0, 1], and 0 turns it off', () => {
    expect(DEFAULT_WEIGHTS.plan.deepSecond).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_WEIGHTS.plan.deepSecond).toBeLessThanOrEqual(1);
    expect(withWeights({ plan: { deepSecond: 0 } }).plan.deepSecond).toBe(0);
  });
});

describe('the budget of the deepening phase', () => {
  test('stretches the work bounds and the shares of the clock by DEEP_FACTOR, on the same work and clock', () => {
    const g = position();
    const clock = { t: 0 };
    const budget = startBudget({ budgetMs: 1000, now: () => clock.t }, { budget: 100, limit: 120 });
    const deep = budget.deep();
    expect(deep.deep()).toBe(deep);
    expect(budget.left()).toBe(100);
    expect(deep.left()).toBe(100 * DEEP_FACTOR);
    // The same work: what the budget's engine does is used on both.
    budget.engine.view(g.state, 0);
    expect(deep.used()).toBe(budget.used());
    expect(deep.left()).toBe(DEEP_FACTOR * 100 - budget.used());
    // The clock: the search stops at its share of the budget, the deep one at DEEP_FACTOR times that.
    clock.t = SEARCH_SHARE * 1000 + 1;
    expect(budget.search().expired(0)).toBe('clock');
    expect(deep.search().expired(0)).toBeNull();
    clock.t = HARD_SHARE * 1000 + 1;
    expect(budget.over()).toBe('clock');
    expect(deep.over()).toBeNull();
    clock.t = DEEP_FACTOR * SEARCH_SHARE * 1000;
    expect(deep.search().expired(0)).toBe('clock');
    clock.t = DEEP_FACTOR * HARD_SHARE * 1000;
    expect(deep.over()).toBe('clock');
    // What either cut is noted for the decision.
    expect(budget.cut()).toBe('clock');
  });

  test('a decision without a budget has none to stretch', () => {
    expect(NO_BUDGET.deep()).toBe(NO_BUDGET);
    expect(NO_BUDGET.left()).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('which lines are played deeper', () => {
  const scored = (...values: number[]): Scored[] =>
    values.map((value, index) => ({ index, value, steps: [] }));
  const weights = withWeights({ plan: { deepMargin: 2 } });

  test("today's line and the lines within the margin of the best, best first", () => {
    const got = deepCandidates(scored(0, 5, 4, 3.5, 1, 3, 2), weights);
    // Best is 5: within 2 are 4 (index 2), 3.5 (3), 3 (5); today (0) is in whatever its value.
    expect(got.map((s) => s.index)).toEqual([0, 1, 2, 3, 5]);
  });

  test('today alone when no line is close, and no more than MAX_DEEP_LINES', () => {
    expect(deepCandidates(scored(0, 9), weights).map((s) => s.index)).toEqual([0, 1]);
    expect(deepCandidates(scored(9, 0, 1), weights).map((s) => s.index)).toEqual([0]);
    const many = deepCandidates(scored(5, ...Array.from({ length: 12 }, () => 5)), weights);
    expect(many).toHaveLength(MAX_DEEP_LINES);
    expect(many[0]?.index).toBe(0);
  });
});

describe('the value of a line', () => {
  test('is the weighted mean less the risk aversion times its gap to the worst scenario', () => {
    const scenarios = [
      { label: 'base', weight: 0.75, state: position().state },
      { label: 'removal', weight: 0.25, state: position().state },
    ];
    // Mean 0.75 * 10 + 0.25 * 2 = 8; the worst is 2; the gap is 6.
    expect(lineValue([10, 2], scenarios, 0.25)).toBeCloseTo(8 - 0.25 * 6, 10);
    expect(lineValue([10, 2], scenarios, 0)).toBeCloseTo(8, 10);
  });
});

describe('a planning that deepens', () => {
  test('plays the close lines one turn further, counted apart from the play-outs of horizon 1', () => {
    const { planning } = plan(position(), DEFAULT_WEIGHTS);
    const record = planning.planned?.record;
    expect(record).toBeDefined();
    expect(record?.deepLines).toBeGreaterThanOrEqual(2);
    expect(record?.deepPlayOuts).toBeGreaterThanOrEqual(record?.deepLines ?? 0);
    expect(record?.deepUnits).toBeGreaterThan(0);
    expect(record?.cut).toBeNull();
    // Each line was played on each scenario to horizon 1; the deeper ones are not in that count.
    expect(record?.playOuts).toBe((record?.scored ?? 0) * (record?.scenarios ?? 0));
  });

  test('a blend of 0 is the planning of step 3: no deep play-out, the same plan and the same work', () => {
    const off = plan(position(), withWeights({ plan: { deepBlend: 0 } }));
    const on = plan(position(), DEFAULT_WEIGHTS);
    expect(off.planning.work).toMatchObject({ deepPlayOuts: 0, deepUnits: 0 });
    expect(off.planning.planned?.record.deepLines).toBe(0);
    expect(off.planning.planned?.record.deepChanged).toBe(false);
    // The deeper phase only adds work after the horizon 1 search: that search is the same.
    expect(on.planning.work.playOuts).toBe(off.planning.work.playOuts);
    expect(on.planning.work.steps).toBeGreaterThan(off.planning.work.steps);
    expect(on.budget.used()).toBeGreaterThan(off.budget.used());
  });

  test('plays the second sample of the draws too when the host gives one, and a share of 0 turns it off', () => {
    const one = plan(position(), DEFAULT_WEIGHTS).planning.work;
    const two = plan(position(), DEFAULT_WEIGHTS, UNBOUNDED, true).planning.work;
    const off = plan(position(), withWeights({ plan: { deepSecond: 0 } }), UNBOUNDED, true).planning
      .work;
    // The horizon 1 search is the same; only the deeper phase plays more.
    expect(two.playOuts).toBe(one.playOuts);
    expect(two.deepPlayOuts).toBeGreaterThan(one.deepPlayOuts);
    expect(off.deepPlayOuts).toBe(one.deepPlayOuts);
  });

  test('is skipped with more than two seats', () => {
    const { planning } = plan(position(3), DEFAULT_WEIGHTS);
    expect(planning.planned?.record.deepLines).toBe(0);
    expect(planning.work.deepPlayOuts).toBe(0);
  });
});

describe('the deeper value of a line', () => {
  /** The pieces `deepen` takes, for the first main phase of the quiet position (one scenario, the base). */
  function pieces(weights: AgentWeights, bounds: WorkBounds = UNBOUNDED) {
    const g = position();
    const view = g.view(0);
    const d = view.pending as PriorityDecision;
    const sample = determinize(g.state, 0, createRng(1));
    const helper = new HeuristicAgent({ seed: 1, weights });
    const today = choosePriorityHeuristic(
      view,
      d,
      { budget: NO_BUDGET, weights, draw: () => 0, sample: () => sample },
      new Set(),
      (v, pending) => handleDecision(pending, helper.decisionHandlers(v)),
    );
    const lines = mainLines(view, d, 'main1', today, new Set(), weights);
    const scenarios = scenariosOf(view, sample, weights, DIRECT.view);
    const budget = startBudget({ budgetMs: 5000, now: () => 0 }, bounds);
    const work = new PlanCounter(budget.engine);
    const scored: Scored[] = lines.map((_, index) => ({ index, value: 1, steps: [] }));
    const ctx = { agents, budget, weights, work };
    return { lines, scenarios, budget, work, scored, ctx, weights };
  }

  test('is the blend of the value at horizon 1 and the value of the same play-out one turn further', () => {
    const weights = withWeights({ plan: { deepBlend: 0.5, deepMargin: 1000 } });
    const p = pieces(weights);
    expect(p.scenarios).toHaveLength(1);
    const out = deepen({ ...p, budget: p.budget.deep(), me: 0, perPlayOut: 1 });
    if (out === null) throw new Error('the deepening did not run');
    expect([...out.keys()].sort()).toEqual(
      p.lines
        .slice(0, MAX_DEEP_LINES)
        .map((_, i) => i)
        .sort(),
    );
    for (const [index, blended] of out) {
      const played = playLine(
        (p.scenarios[0] as (typeof p.scenarios)[number]).state,
        0,
        p.lines[index] as Line,
        { agents, budget: NO_BUDGET, weights, work: new PlanCounter(DIRECT) },
        false,
        2,
      );
      if (played === null) throw new Error('the play-out was dropped');
      const deeper = evaluate(DIRECT.view(played.end, 0), 0, weights).score;
      expect(blended).toBeCloseTo(0.5 * 1 + 0.5 * deeper, 8);
    }
    expect(p.work.deepPlayOuts).toBe(out.size);
    expect(p.work.deepUnits).toBeGreaterThan(0);
  });

  test('is not computed when the work left is below the cost of one deep play-out', () => {
    const p = pieces(DEFAULT_WEIGHTS, { budget: 1000, limit: 1200 });
    const deep = p.budget.deep();
    const room = deep.left();
    expect(room).toBe(2000);
    // A play-out that costs more than what is left: no deep play-out starts.
    expect(deepen({ ...p, budget: deep, me: 0, perPlayOut: room })).toBeNull();
    expect(p.work.deepPlayOuts).toBe(0);
    // One that costs less than half of it (DEEP_COST times it fits): the deepening runs.
    const ok = pieces(DEFAULT_WEIGHTS, { budget: 1e9, limit: 1e9 });
    expect(deepen({ ...ok, budget: ok.budget.deep(), me: 0, perPlayOut: 10 })).not.toBeNull();
  });

  test('gives nothing when the budget runs out inside the phase', () => {
    const p = pieces(DEFAULT_WEIGHTS, { budget: 1, limit: 1 });
    expect(deepen({ ...p, budget: p.budget.deep(), me: 0, perPlayOut: 0 })).toBeNull();
    expect(p.work.deepPlayOuts).toBe(1);
  });

  describe("with a second sample of the agent's draws", () => {
    /** The base scenario of another determinization of the same position (the agent's library dealt again). */
    const secondOf = (weights: AgentWeights) => {
      const g = position();
      const view = g.view(0);
      const other = determinize(g.state, 0, createRng(2));
      const [base] = scenariosOf(view, other, weights, DIRECT.view);
      return base as NonNullable<typeof base>;
    };

    test('the base scenario is split between the two samples and the line is played on both', () => {
      const weights = withWeights({ plan: { deepBlend: 1, deepMargin: 1000, deepSecond: 0.25 } });
      const p = pieces(weights);
      const second = secondOf(weights);
      const out = deepen({
        ...p,
        budget: p.budget.deep(),
        me: 0,
        perPlayOut: 1,
        second: () => second,
      });
      if (out === null) throw new Error('the deepening did not run');
      // One scenario in the quiet position: the first sample's base (0.75) and the second sample's (0.25).
      const ctx = { agents, budget: NO_BUDGET, weights, work: new PlanCounter(DIRECT) };
      const score = (state: GameState, line: Line): number => {
        const played = playLine(state, 0, line, ctx, false, 2);
        if (played === null) throw new Error('the play-out was dropped');
        return evaluate(DIRECT.view(played.end, 0), 0, weights).score;
      };
      for (const [index, value] of out) {
        const line = p.lines[index] as Line;
        const a = score((p.scenarios[0] as Scenario).state, line);
        const b = score(second.state, line);
        const expected = lineValue(
          [a, b],
          [
            { ...(p.scenarios[0] as Scenario), weight: 0.75 },
            { ...second, weight: 0.25 },
          ],
          weights.plan.riskAversion,
        );
        expect(value).toBeCloseTo(expected, 8);
      }
      // Every candidate was played on the first sample, the better half of them on the second as well.
      expect(p.work.deepPlayOuts).toBe(deepCandidates(p.scored, weights).length + out.size);
    });

    test('is not asked for, and costs nothing, with a share of 0 or when it is not given', () => {
      const off = pieces(withWeights({ plan: { deepSecond: 0, deepMargin: 1000 } }));
      let asked = 0;
      const out = deepen({
        ...off,
        budget: off.budget.deep(),
        me: 0,
        perPlayOut: 1,
        second: () => {
          asked += 1;
          return undefined;
        },
      });
      expect(asked).toBe(0);
      expect(off.work.deepPlayOuts).toBe(out?.size);
      const on = pieces(withWeights({ plan: { deepSecond: 0.5, deepMargin: 1000 } }));
      const same = deepen({ ...on, budget: on.budget.deep(), me: 0, perPlayOut: 1 });
      expect(on.work.deepPlayOuts).toBe(same?.size);
    });
  });

  test('does not run with a blend of 0', () => {
    const p = pieces(withWeights({ plan: { deepBlend: 0 } }));
    expect(deepen({ ...p, budget: p.budget.deep(), me: 0, perPlayOut: 1 })).toBeNull();
    expect(p.work.deepPlayOuts).toBe(0);
  });
});

// Parallel play-outs (issue 653, step 2c): the turn planner on a pool of workers decides what it decides on
// one thread and counts the work it counts, because it settles the traces of the play-outs in its own order
// (`heuristic-plan-trace.ts`). A deterministic fake pool runs the play-outs in process through the same
// `PlanService` a worker script uses, hands back traces that went through JSON (what a worker's message
// holds), and answers out of order, so a result that depended on the order of arrival would show.
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
import type { DecideContext } from '../src/agent';
import { evaluate } from '../src/evaluate';
import {
  type Budget,
  startBudget,
  type Think,
  Work,
  type WorkBounds,
} from '../src/heuristic-budget';
import { choosePriorityHeuristic } from '../src/heuristic-main';
import { choosePlan } from '../src/heuristic-plan';
import { mainLines } from '../src/heuristic-plan-lines';
import { choosePlanOn } from '../src/heuristic-plan-pool';
import { PlanRunner, PlanService } from '../src/heuristic-plan-runner';
import { playLine } from '../src/heuristic-plan-sim';
import { settle, TraceNode } from '../src/heuristic-plan-trace';
import type {
  PlanJobSpec,
  PlayOutJob,
  PlayOutPool,
  PlayOutTrace,
} from '../src/heuristic-plan-types';
import { KEEP, PlanCounter } from '../src/heuristic-plan-work';
import { HeuristicAgent, simAgentsOf } from '../src/index';
import { DEFAULT_WEIGHTS } from '../src/weights';

const V2 = 'SYNTHETIC Vanilla 2/2';
const V3 = 'SYNTHETIC Vanilla 3/3';
const FORESTS = ['Forest', 'Forest', 'Forest', 'Forest', 'Forest'];

function mainPhase(
  hand: readonly string[],
  lands: readonly string[],
  opp: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
): ScenarioGame {
  return opp(
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(...lands)
      .landsPlayed(1)
      .library('Island', { count: 10 })
      .seat(1),
  )
    .at('precombatMain', { active: 0 })
    .build();
}

const quiet = (b: ReturnType<typeof scenario>) => b.library('Grizzly Bears', { count: 10 });
const angels = (b: ReturnType<typeof scenario>) =>
  b
    .hand('Serra Angel', { count: 3 })
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .library('Serra Angel', { count: 10 });
const board = (b: ReturnType<typeof scenario>) =>
  b
    .battlefield('Grizzly Bears', 'Giant Spider', V3)
    .hand('Grizzly Bears')
    .library('Grizzly Bears', { count: 10 });
// Creatures on both sides: the opponent's attack and block searches run inside the play-outs (issue 653).
const crowd = (b: ReturnType<typeof scenario>) =>
  b
    .battlefield(V3, V3, V3, 'Grizzly Bears')
    .hand('Grizzly Bears')
    .library('Grizzly Bears', { count: 10 });

/** The pool a test gives the agent: runs everything in process, answers out of order, and counts. */
class FakePool implements PlayOutPool {
  readonly size: number;
  opened = 0;
  runs = 0;
  closed = 0;
  /** The steps of the traces answered in which an opponent's combat search ran (`TraceMove.side`). */
  searched = 0;
  private readonly fail: 'none' | 'run' | 'open';
  private next = 0;

  constructor(size: number, fail: 'none' | 'run' | 'open' = 'none') {
    this.size = size;
    this.fail = fail;
  }

  open(spec: PlanJobSpec): PlayOutJob {
    this.opened += 1;
    if (this.fail === 'open') throw new Error('no worker');
    // What a worker receives: a structured clone of the planning's plain data.
    const service = new PlanService(simAgentsOf);
    service.open(1, structuredClone(spec));
    return {
      run: async (line, scenarioIndex, record, _group, horizon) => {
        this.runs += 1;
        // Out of order: the later the call, the fewer ticks it waits (some of them).
        this.next += 1;
        for (let i = 0; i < (this.next * 7) % 5; i += 1) await Promise.resolve();
        if (this.fail === 'run') throw new Error('worker crashed');
        const trace = service.run(1, line, scenarioIndex, record, horizon);
        this.searched += trace.moves.filter((m) => m.side !== undefined).length;
        return JSON.parse(JSON.stringify(trace)) as PlayOutTrace;
      },
      close: () => {
        this.closed += 1;
        service.close(1);
      },
    };
  }
}

const timeless = (record: object): object =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'ms' && k !== 'elapsed'));

/** The pieces of one priority decision of seat 0, as the agent puts them together. */
function decisionOf(g: ScenarioGame, seed: number) {
  const view = g.view(0);
  const d = view.pending;
  if (d === null || d.kind !== 'priority') throw new Error('a priority decision expected');
  const sample = determinize(g.state, 0, createRng(seed));
  const helper = new HeuristicAgent({ seed: 1 });
  const answer = (v: GameView, pending: PendingDecision): Action =>
    handleDecision(pending, helper.decisionHandlers(v));
  const agents = simAgentsOf(DEFAULT_WEIGHTS);
  const thinkOf = (budget: Budget): Think => ({
    budget,
    weights: DEFAULT_WEIGHTS,
    draw: () => 0,
    sample: () => sample,
  });
  const prepare = (budget: Budget) => {
    const think = thinkOf(budget);
    const today = choosePriorityHeuristic(view, d as PriorityDecision, think, new Set(), answer);
    const lines = mainLines(
      view,
      d as PriorityDecision,
      'main1',
      today,
      new Set(),
      DEFAULT_WEIGHTS,
    );
    return { think, lines };
  };
  return {
    single: (budget: Budget) => {
      const { think, lines } = prepare(budget);
      return { planning: choosePlan(view, 'main1', lines, think, agents), used: budget.used() };
    },
    pooled: async (budget: Budget, pool: PlayOutPool) => {
      const { think, lines } = prepare(budget);
      const planning = await choosePlanOn(view, 'main1', lines, think, agents, pool);
      return { planning, used: budget.used() };
    },
  };
}

const budgetOf = (bounds: WorkBounds): Budget =>
  startBudget({ budgetMs: 5000, now: () => 0 }, bounds);
const UNBOUNDED: WorkBounds = { budget: 1e9, limit: 1e9 };

const outcome = (r: { planning: ReturnType<typeof choosePlan>; used: number }) => ({
  used: r.used,
  plan: r.planning.planned?.plan,
  index: r.planning.planned?.index,
  record: r.planning.planned === null ? null : timeless(r.planning.planned.record),
  work: timeless(r.planning.work),
});

/** Each position, and whether the opponent has creatures to attack or block with in its play-outs. */
const positions: [string, () => ScenarioGame, boolean][] = [
  ['spells to plan', () => mainPhase([V2, V3], FORESTS, quiet), false],
  [
    'a counterspell held against threats',
    () =>
      mainPhase(['Counterspell', 'Divination'], ['Island', 'Island', 'Island', 'Island'], angels),
    true,
  ],
  ['a board with a spell in hand', () => mainPhase(['Grizzly Bears', V2], FORESTS, board), true],
  [
    'creatures on both sides, the opponent searching its attacks and blocks',
    () => mainPhase([V2], [...FORESTS, V3, 'Giant Spider'], crowd),
    true,
  ],
];

describe('the planner on a pool of workers', () => {
  test.each(positions)(
    '%s: the same plan, work and budget as on one thread, whatever the budget, for several samples',
    async (_, make, fights) => {
      let compared = 0;
      let searched = 0;
      for (const seed of [1, 2, 3, 4]) {
        const probe = decisionOf(make(), seed).single(budgetOf(UNBOUNDED));
        const vetting = decisionOf(make(), seed).single(budgetOf({ budget: 1, limit: 1e9 })).used;
        const planner = probe.used - vetting;
        const bounds: WorkBounds[] = [
          UNBOUNDED,
          { budget: vetting + planner / 2, limit: vetting + planner },
          { budget: vetting + planner / 4, limit: vetting + planner / 3 },
          { budget: vetting, limit: vetting },
        ];
        for (const b of bounds) {
          const pool = new FakePool(3);
          const one = decisionOf(make(), seed).single(budgetOf(b));
          const many = await decisionOf(make(), seed).pooled(budgetOf(b), pool);
          expect(outcome(many)).toEqual(outcome(one));
          expect(pool.closed).toBe(pool.opened);
          compared += one.planning.work.playOuts;
          searched += pool.searched;
        }
      }
      // The pool did the play-outs: the comparison is not of two empty plannings.
      expect(compared).toBeGreaterThan(10);
      // Where the opponent has creatures, its combat searches ran inside the pool's play-outs.
      if (fights) expect(searched).toBeGreaterThan(0);
    },
    60_000,
  );

  test.each(positions)(
    '%s: a planning that deepens is the same on a pool: plan, work, deep play-outs and cuts, out of order',
    async (_, make) => {
      let deepened = 0;
      let cutInside = 0;
      for (const seed of [1]) {
        // A clock that moves with every read: the planner (and `settle`) read it at the same places on one
        // thread and on a pool, so a cut by the clock inside the deepening must come at the same play-out.
        const reads = { n: 0 };
        decisionOf(make(), seed).single(
          startBudget({ budgetMs: 5000, now: () => (reads.n += 1) }, UNBOUNDED),
        );
        const clockBudget = (tick: number): Budget => {
          let t = 0;
          return startBudget({ budgetMs: 5000, now: () => (t += tick) }, UNBOUNDED);
        };
        const shares = Array.from({ length: 25 }, (_, i) => 0.38 + i * 0.01);
        const ticks = [0, ...shares, 0.8, 1].map((f) => (f * 5500) / reads.n);
        const bounds: WorkBounds[] = [UNBOUNDED];
        const probe = decisionOf(make(), seed).single(budgetOf(UNBOUNDED));
        const wk = probe.planning.work;
        // Work bounds that end the deepening after its first play-out (its stretched bounds are twice these).
        const before = probe.used - wk.deepUnits;
        bounds.push({ budget: before + 1, limit: before + 1 }, { budget: before, limit: before });
        for (const b of bounds) {
          const pool = new FakePool(3);
          const one = decisionOf(make(), seed).single(budgetOf(b));
          const many = await decisionOf(make(), seed).pooled(budgetOf(b), pool);
          expect(outcome(many)).toEqual(outcome(one));
          expect(pool.closed).toBe(pool.opened);
          if (one.planning.work.deepPlayOuts > 0) deepened += 1;
        }
        for (const tick of ticks) {
          const pool = new FakePool(3);
          const one = decisionOf(make(), seed).single(clockBudget(tick));
          const many = await decisionOf(make(), seed).pooled(clockBudget(tick), pool);
          expect(outcome(many)).toEqual(outcome(one));
          const work = one.planning.work;
          if (work.deepPlayOuts > 0) deepened += 1;
          if (work.deepPlayOuts > 0 && work.cut !== null) cutInside += 1;
        }
      }
      // The pool played deep play-outs, and the clock cut a planning inside the deepening.
      expect(deepened).toBeGreaterThan(5);
      expect(cutInside).toBeGreaterThan(0);
    },
    60_000,
  );

  test('a pool that fails to open or to answer changes nothing: the play-outs are played on this thread', async () => {
    const make = () => mainPhase(['Grizzly Bears', V2], FORESTS, board);
    const one = decisionOf(make(), 1).single(budgetOf(UNBOUNDED));
    for (const fail of ['open', 'run'] as const) {
      const pool = new FakePool(2, fail);
      const many = await decisionOf(make(), 1).pooled(budgetOf(UNBOUNDED), pool);
      expect(outcome(many)).toEqual(outcome(one));
      expect(pool.opened).toBe(1);
    }
  });

  test('settling a trace counts what the planning would have counted, kept steps included', () => {
    const g = mainPhase(['Grizzly Bears', V2], FORESTS, board);
    const view = g.view(0);
    const sample = determinize(g.state, 0, createRng(1));
    const pending = view.pending as PriorityDecision;
    const helper = new HeuristicAgent({ seed: 1 });
    const today = choosePriorityHeuristic(
      view,
      pending,
      {
        budget: budgetOf(UNBOUNDED),
        weights: DEFAULT_WEIGHTS,
        draw: () => 0,
        sample: () => sample,
      },
      new Set(),
      (v, p) => handleDecision(p, helper.decisionHandlers(v)),
    );
    const lines = mainLines(view, pending, 'main1', today, new Set(), DEFAULT_WEIGHTS);
    expect(lines.length).toBeGreaterThan(2);
    const agents = simAgentsOf(DEFAULT_WEIGHTS);
    const runner = new PlanRunner(
      { me: 0, weights: DEFAULT_WEIGHTS, lines, scenarios: [sample] },
      agents,
    );
    // Both counters start as if the planning had built KEEP - 4 of each already: the bound is reached inside.
    const start = (engine: Work) => {
      const c = new PlanCounter(engine);
      c.views = KEEP - 4;
      c.applies = KEEP - 4;
      return c;
    };
    const engine = new Work();
    const direct = start(engine);
    const settledEngine = new Work();
    const settled = start(settledEngine);
    const root = new TraceNode();
    const budget = budgetOf(UNBOUNDED);
    const own = {
      ...budget,
      engine: settledEngine,
      charge: (u: number) => settledEngine.charge(u),
    };
    let searched = 0;
    for (const [i, line] of lines.entries()) {
      const trace = runner.run(i, 0, i === 0);
      searched += trace.moves.filter((m) => m.side !== undefined).length;
      const played = playLine(
        sample,
        0,
        line,
        { agents, budget: budgetOf(UNBOUNDED), weights: DEFAULT_WEIGHTS, work: direct },
        i === 0,
      );
      const scored =
        played === null ? null : evaluate(direct.view(played.end, 0), 0, DEFAULT_WEIGHTS).score;
      const result = settle(settled, own, 0, root, trace);
      expect(result === null ? null : result.score).toBe(scored);
      expect(settled.steps).toBe(direct.steps);
      expect(settled.views).toBe(direct.views);
      expect(settled.applies).toBe(direct.applies);
      expect(settledEngine.units).toBe(engine.units);
      expect(settledEngine.calls).toBe(engine.calls);
    }
    // The bound was crossed, and what is shared before it was not paid for twice.
    expect(direct.applies).toBeGreaterThan(KEEP);
    // The opponent's attack search ran inside the play-outs, and its calls were settled as they were made.
    expect(searched).toBeGreaterThan(0);
  });
});

/** A game of `limit` decisions in which seat 0's agent may have a pool; everything it decided, times left out. */
async function play(make: () => ScenarioGame, limit: number, pool?: PlayOutPool) {
  const g = make();
  const agents = [new HeuristicAgent({ seed: 1 }), new HeuristicAgent({ seed: 2 })];
  const log: { seat: number; action: Action }[] = [];
  for (let i = 0; i < limit && g.state.pending !== null && g.state.result === null; i += 1) {
    const seat = g.deciding;
    const view = g.view(seat);
    if (view.pending === null) break;
    const state: GameState = g.state;
    const ctx: DecideContext = {
      budgetMs: 5000,
      now: () => 0,
      sample: (seed) => determinize(state, seat, createRng(seed)),
      ...(pool === undefined ? {} : { playOuts: pool }),
    };
    const action = await (agents[seat] as HeuristicAgent).decide(view, view.pending, ctx);
    log.push({ seat, action });
    g.choose(action);
  }
  const first = agents[0] as HeuristicAgent;
  return {
    log,
    reasons: agents.map((a) => a.reasons),
    plannings: agents.map((a) => a.plannings.map(timeless)),
    plans: agents.map((a) => a.plans.map(timeless)),
    searches: agents.map((a) => a.searches.map(timeless)),
    fallbacks: agents.map((a) => a.fallbacks),
    planned: first.plans.length,
  };
}

describe('a game with a pool', () => {
  const games: [string, () => ScenarioGame, number][] = [
    ['spells to plan', () => mainPhase([V2, V3], FORESTS, quiet), 60],
    [
      'a counterspell held against threats',
      () =>
        mainPhase(['Counterspell', 'Divination'], ['Island', 'Island', 'Island', 'Island'], angels),
      60,
    ],
    ['a board with a spell in hand', () => mainPhase(['Grizzly Bears', V2], FORESTS, board), 80],
    ['creatures on both sides', () => mainPhase([V2], [...FORESTS, V3, 'Giant Spider'], crowd), 80],
  ];

  test.each(games)(
    '%s: the same decisions, plans and work as without it',
    async (_, make, limit) => {
      const alone = await play(make, limit);
      const pool = new FakePool(4);
      const together = await play(make, limit, pool);
      expect(alone.planned).toBeGreaterThan(0);
      expect(pool.runs).toBeGreaterThan(alone.plans[0]?.length ?? 0);
      expect(pool.closed).toBe(pool.opened);
      expect(together.fallbacks.flat()).toEqual([]);
      expect(together).toEqual(alone);
    },
  );

  test('a pool of one worker is not used', async () => {
    const make = () => mainPhase([V2, V3], FORESTS, quiet);
    const pool = new FakePool(1);
    const one = await play(make, 30, pool);
    expect(pool.opened).toBe(0);
    expect(one).toEqual(await play(make, 30));
  });
});

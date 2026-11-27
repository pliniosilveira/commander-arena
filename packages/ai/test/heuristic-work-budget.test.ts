// One work budget per decision (issue 653, step 2): the searches of a decision (today's choice and its
// vetting, the turn planner, the attack and block searches) draw from one budget of engine work in a fixed
// order, and the clock is only a safety cutoff. So a decision does not depend on how fast the clock runs as
// long as the safety cutoff is not reached, and a search that has used the budget stops the ones after it.
import {
  type Action,
  createRng,
  type DecisionKind,
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
import { type Budget, startBudget, type Think, type WorkBounds } from '../src/heuristic-budget';
import { choosePriorityHeuristic } from '../src/heuristic-main';
import { choosePlan } from '../src/heuristic-plan';
import { mainLines } from '../src/heuristic-plan-lines';
import type { SimAgents } from '../src/heuristic-plan-sim';
import { HeuristicAgent } from '../src/index';
import { DEFAULT_WEIGHTS } from '../src/weights';

const V2 = 'SYNTHETIC Vanilla 2/2';
const V3 = 'SYNTHETIC Vanilla 3/3';
const V5 = 'SYNTHETIC Vanilla 5/5';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const RATS = 'Typhoid Rats';
const FORESTS = ['Forest', 'Forest', 'Forest', 'Forest', 'Forest'];

/** Seat 0 in its own first main phase with `hand` and `lands`; the opponent set up by `opp`. */
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

const quiet = (b: ReturnType<typeof scenario>) => b.library(BEARS, { count: 10 });
const angels = (b: ReturnType<typeof scenario>) =>
  b
    .hand('Serra Angel', { count: 3 })
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .library('Serra Angel', { count: 10 });

/** Four attackers into three blockers, then the opponent's attack into four blockers: both searches run. */
const combat = (): ScenarioGame =>
  scenario()
    .seat(0)
    .life(12)
    .battlefield(BEARS, SPIDER, V3, V5)
    .library('Island', { count: 10 })
    .seat(1)
    .battlefield(BEARS, RATS, V2)
    .library('Island', { count: 10 })
    .at('precombatMain', { active: 0 })
    .build();

/** A logical clock that moves `step` ms on every read. */
function steppingClock(step: number) {
  const clock = { t: 0 };
  return {
    clock,
    now: () => {
      clock.t += step;
      return clock.t;
    },
  };
}

interface Decided {
  readonly seat: number;
  readonly kind: DecisionKind;
  readonly action: Action;
}

/** Everything a game of `limit` decisions recorded, the times left out. */
async function play(make: () => ScenarioGame, now: () => number, limit: number) {
  const g = make();
  const agents = [new HeuristicAgent({ seed: 1 }), new HeuristicAgent({ seed: 2 })];
  const log: Decided[] = [];
  for (let i = 0; i < limit && g.state.pending !== null && g.state.result === null; i += 1) {
    const seat = g.deciding;
    const view = g.view(seat);
    if (view.pending === null) break;
    const state: GameState = g.state;
    const ctx: DecideContext = {
      budgetMs: 5000,
      now,
      sample: (seed) => determinize(state, seat, createRng(seed)),
    };
    const action = await (agents[seat] as HeuristicAgent).decide(view, view.pending, ctx);
    log.push({ seat, kind: view.pending.kind, action });
    g.choose(action);
  }
  return {
    log,
    reasons: agents.map((a) => a.reasons),
    // Every planning, with the chosen line of those that ended in a plan.
    plannings: agents.map((a) => a.plannings.map(timeless)),
    searches: agents.map((a) => a.searches.map(timeless)),
    searched: agents.flatMap((a) => a.searches.map((s) => s.kind)),
    cuts: agents.flatMap((a) => [...a.searches, ...a.plannings].map((r) => r.cut)),
  };
}

/** A record without its times on the decision's clock (`ms`, `elapsed`). */
const timeless = (record: object): object =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'ms' && k !== 'elapsed'));

describe('the same decision on a fast and on a slow device', () => {
  const positions: [string, () => ScenarioGame, number, DecisionKind][] = [
    ['a main phase with spells to plan', () => mainPhase([V2, V3], FORESTS, quiet), 40, 'priority'],
    [
      'a counterspell held against a hand of threats',
      () =>
        mainPhase(['Counterspell', 'Divination'], ['Island', 'Island', 'Island', 'Island'], angels),
      40,
      'priority',
    ],
    ['attacks and blocks on a full board', combat, 60, 'declareBlockers'],
  ];

  test.each(positions)(
    '%s: a clock 1000 times slower gives the same actions, plans and work while the safety cutoff is not reached',
    async (_, make, limit, kind) => {
      const fast = steppingClock(0.001);
      const slow = steppingClock(1);
      const a = await play(make, fast.now, limit);
      const b = await play(make, slow.now, limit);
      // The searches ran, and the slow clock never reached the safety cutoff.
      expect(b.searched).toContain(kind);
      expect(b.cuts).not.toContain('clock');
      expect(slow.clock.t).toBeGreaterThan(500 * fast.clock.t);
      expect(b).toEqual(a);
    },
  );
});

/** The pieces of one priority decision of seat 0, as the agent puts them together. */
function decisionOf(g: ScenarioGame) {
  const view = g.view(0);
  const d = view.pending;
  if (d === null || d.kind !== 'priority') throw new Error('a priority decision expected');
  const sample = determinize(g.state, 0, createRng(1));
  const helper = new HeuristicAgent({ seed: 1 });
  const answer = (v: GameView, pending: PendingDecision): Action =>
    handleDecision(pending, helper.decisionHandlers(v));
  const agents: SimAgents = {
    start: () => {
      const inner = new Map<number, HeuristicAgent>();
      return (seat) => {
        const agent = inner.get(seat) ?? new HeuristicAgent({ seed: 7919 + seat });
        inner.set(seat, agent);
        return (v) => agent.decisionHandlers(v);
      };
    },
  };
  const thinkOf = (budget: Budget): Think => ({
    budget,
    weights: DEFAULT_WEIGHTS,
    draw: () => 0,
    sample: () => sample,
  });
  /** Today's choice (with its vetting), then the planner, on one budget: the agent's order. */
  const decide = (budget: Budget) => {
    const think = thinkOf(budget);
    const today = choosePriorityHeuristic(view, d as PriorityDecision, think, new Set(), answer);
    const afterToday = budget.used();
    const lines = mainLines(
      view,
      d as PriorityDecision,
      'main1',
      today,
      new Set(),
      DEFAULT_WEIGHTS,
    );
    const planning = choosePlan(view, 'main1', lines, think, agents);
    return { today, afterToday, lines, planning, used: budget.used() };
  };
  return { decide };
}

const budgetOf = (bounds: WorkBounds, now: () => number = () => 0): Budget =>
  startBudget({ budgetMs: 5000, now }, bounds);
const UNBOUNDED: WorkBounds = { budget: 1e9, limit: 1e9 };

describe('one budget for the searches of a decision', () => {
  const make = () => mainPhase([V2, V3], FORESTS, angels);

  test("the planner gets what today's vetting left, and stops when it is used", () => {
    const full = decisionOf(make()).decide(budgetOf(UNBOUNDED));
    // Today's vetting played its candidates out first; the planner then scored every line.
    expect(full.afterToday).toBeGreaterThan(0);
    expect(full.planning.work.cut).toBeNull();
    expect(full.planning.planned).not.toBeNull();
    const vetting = full.afterToday;
    const planner = full.used - vetting;
    // The Serra Angels cannot attack before the agent's next turn (no haste: the opponent profile), so each line
    // is played on the base scenario alone, one play-out a line.
    expect(full.planning.work.playOuts).toBeGreaterThan(2);

    // Half of what the planner needs: it stops at the budget, having scored fewer play-outs.
    const bounds = { budget: vetting + planner / 2, limit: vetting + planner };
    const half = decisionOf(make()).decide(budgetOf(bounds));
    expect(half.afterToday).toBe(vetting);
    expect(half.today).toEqual(full.today);
    expect(half.planning.work.cut).toBe('work');
    expect(half.planning.work.playOuts).toBeLessThan(full.planning.work.playOuts);
    expect(half.used).toBeLessThanOrEqual(bounds.limit);

    // A budget the vetting uses up leaves the planner nothing: it does not start.
    const none = decisionOf(make()).decide(budgetOf({ budget: vetting, limit: vetting }));
    expect(none.today).toEqual(full.today);
    expect(none.planning.planned).toBeNull();
    expect(none.planning.work).toMatchObject({ playOuts: 0, views: 0, applies: 0, cut: 'work' });
    expect(none.used).toBe(vetting);
  });

  test('the vetting stops too, and keeps the plays it did not reach', () => {
    const full = decisionOf(make()).decide(budgetOf(UNBOUNDED));
    // Room for passing only: no play is vetted, and today's choice is still a play of the set.
    const tiny = decisionOf(make()).decide(budgetOf({ budget: 1, limit: 1e9 }));
    expect(tiny.afterToday).toBeLessThan(full.afterToday);
    expect(tiny.today.action.kind).toBe('castSpell');
  });

  test('a planning cut by the work is the same on a fast and on a slow clock', () => {
    const full = decisionOf(make()).decide(budgetOf(UNBOUNDED));
    const bounds = { budget: full.afterToday + (full.used - full.afterToday) / 2, limit: 1e9 };
    const fast = decisionOf(make()).decide(budgetOf(bounds, steppingClock(0.001).now));
    const slow = decisionOf(make()).decide(budgetOf(bounds, steppingClock(1).now));
    expect(fast.planning.work.cut).toBe('work');
    const outcome = (p: typeof fast) => ({
      today: p.today,
      used: p.used,
      plan: p.planning.planned?.plan,
      work: timeless(p.planning.work),
    });
    expect(outcome(slow)).toEqual(outcome(fast));
  });
});

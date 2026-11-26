// The turn planner of the HeuristicAgent (issue 624, phase 3): a plan is made once at the first priority
// decision of the main phase and followed while the board is the one it expected (reason `plan`, no
// search); a surprise makes it plan again (`replan`). Lines are scored on threat scenarios: keeping a
// counterspell open beats tapping out when the opponent is likely to cast a threat, and loses when it
// holds nothing. Mana left over goes to an activated ability at the opponent's end step.
import {
  type Action,
  createRng,
  type DecisionKind,
  determinize,
  type GameState,
} from '@commander-arena/engine';
import type { ScenarioGame } from '@commander-arena/engine/testing';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import type { DecideContext, Reason } from '../src/index';
import { HeuristicAgent } from '../src/index';
import { LIBRARY_LAMP } from './blunders/cards';

const V1 = 'SYNTHETIC Vanilla 1/1';
const V2 = 'SYNTHETIC Vanilla 2/2';
const V3 = 'SYNTHETIC Vanilla 3/3';
const BEARS = 'Grizzly Bears';

interface Decided {
  readonly seat: number;
  readonly kind: DecisionKind;
  readonly action: Action;
  readonly reason: Reason | undefined;
  /** How many samples the decision asked for (0: no search). */
  readonly samples: number;
}

/**
 * Plays `g` with a HeuristicAgent in each seat (seat 0 is `agent`) until `stop` holds or `limit`
 * decisions were made, and records every decision with its reason and the samples it built.
 */
async function drive(
  g: ScenarioGame,
  agent: HeuristicAgent,
  stop: (g: ScenarioGame, log: readonly Decided[]) => boolean,
  limit = 80,
): Promise<Decided[]> {
  const other = new HeuristicAgent({ seed: 2 });
  const log: Decided[] = [];
  for (let i = 0; i < limit && g.state.pending !== null && !stop(g, log); i += 1) {
    const seat = g.deciding;
    const who = seat === 0 ? agent : other;
    const view = g.view(seat);
    const pending = view.pending;
    if (pending === null) break;
    const state: GameState = g.state;
    let samples = 0;
    const ctx: DecideContext = {
      budgetMs: 1000,
      now: () => 0,
      sample: (seed) => {
        samples += 1;
        return determinize(state, seat, createRng(seed));
      },
    };
    const action = await who.decide(view, pending, ctx);
    const reason = who.reasons[who.reasons.length - 1]?.reason;
    log.push({ seat, kind: pending.kind, action, reason, samples });
    g.choose(action);
  }
  return log;
}

const mine = (log: readonly Decided[]) => log.filter((d) => d.seat === 0);
const casts = (log: readonly Decided[]) =>
  mine(log).filter((d) => d.action.kind === 'castSpell' || d.action.kind === 'activate');

/** Seat 0 in its own first main phase with `hand` and `lands`; the opponent set up by `opp`. */
function position(
  hand: readonly string[],
  lands: readonly string[],
  opp: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
  extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
) {
  let b = extra(scenario()).seat(0);
  if (hand.length > 0) b = b.hand(...hand);
  b = b
    .battlefield(...lands)
    .landsPlayed(1)
    .library('Island', { count: 10 })
    .seat(1);
  return opp(b).at('precombatMain', { active: 0 }).build();
}

const quietOpponent = (b: ReturnType<typeof scenario>) => b.library(BEARS, { count: 10 });

describe('following a plan', () => {
  test('after the first planned spell resolves, the next step is taken from the plan, with no search', async () => {
    const g = position([V2, V3], ['Forest', 'Forest', 'Forest', 'Forest', 'Forest'], quietOpponent);
    const agent = new HeuristicAgent({ seed: 1 });
    const log = await drive(g, agent, (_, l) => casts(l).length >= 2);
    const [first, second] = casts(log);
    // The sample of the decision and the second one of the deepening (`heuristic-plan-deep.ts`).
    expect(first?.samples).toBe(2);
    expect(second?.reason).toBe('plan');
    expect(second?.samples).toBe(0);
    expect(agent.plans).toHaveLength(1);
  });

  test('a countered spell is a surprise: the next decision of the main phase plans again', async () => {
    const g = position(
      [V3, V2, V1],
      ['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest'],
      (b) => b.hand('Counterspell').battlefield('Island', 'Island').library(BEARS, { count: 10 }),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    const log = await drive(g, agent, (gg) => gg.state.turn.step !== 'precombatMain');
    const countered = log.some((d) => d.seat === 1 && d.action.kind === 'castSpell');
    expect(countered).toBe(true);
    expect(mine(log).map((d) => d.reason)).toContain('replan');
  });
});

describe('hold lines and tap-out lines', () => {
  const myHand = ['Counterspell', 'Divination'];
  const islands = ['Island', 'Island', 'Island', 'Island'];

  test('the opponent has a big hand of threats and the mana to cast one: the counterspell is kept open', async () => {
    const g = position(myHand, islands, (b) =>
      b
        .hand('Serra Angel', { count: 4 })
        .hand('Plains', { count: 3 })
        .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
        .library('Serra Angel', { count: 10 })
        .library('Plains', { count: 10 }),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    const [first] = await drive(g, agent, (_, l) => l.length >= 1);
    expect(first?.action.kind).toBe('pass');
    expect(first?.reason).toBe('plan');
    expect(agent.plans[0]?.chosen).toMatch(/^hold:Counterspell/);
  });

  test('the opponent has no hand and no mana: the agent taps out for Divination', async () => {
    const g = position(myHand, islands, quietOpponent);
    const divination = g.view(0).seats[0]?.hand?.find((o) => o.name === 'Divination')?.id;
    const agent = new HeuristicAgent({ seed: 1 });
    const [first] = await drive(g, agent, (_, l) => l.length >= 1);
    expect(first?.action).toEqual({ kind: 'castSpell', object: divination });
    expect(first?.reason).toBe('curve');
  });

  test('the same seed makes the same plan', async () => {
    const play = async () => {
      const g = position(myHand, islands, (b) =>
        b
          .hand('Serra Angel', { count: 4 })
          .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
          .library('Serra Angel', { count: 5 })
          .library('Plains', { count: 10 }),
      );
      const agent = new HeuristicAgent({ seed: 5 });
      const log = await drive(g, agent, (_, l) => l.length >= 6);
      return { log, plans: agent.plans };
    };
    const a = await play();
    const b = await play();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('ability lines', () => {
  test('mana nothing else uses goes to "{3}: Draw a card" at the opponent\'s end step', async () => {
    const g = position([], [LIBRARY_LAMP.name, 'Island', 'Island', 'Island'], quietOpponent, (b) =>
      b.define(LIBRARY_LAMP),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    const log = await drive(g, agent, (_, l) => casts(l).length >= 1, 120);
    const [first] = mine(log);
    expect(first?.action.kind).toBe('pass');
    expect(first?.reason).toBe('plan');
    const [draw] = casts(log);
    expect(draw?.action).toMatchObject({ kind: 'activate', object: g.id(LIBRARY_LAMP.name) });
    expect(draw?.reason).toBe('plan');
    expect(g.state.turn.activeSeat).toBe(1);
    expect(g.state.turn.step).toBe('end');
  });
});

describe('the planner against today', () => {
  test("the chosen line never scores below today's line", async () => {
    const positions = [
      position([V2, V3], ['Forest', 'Forest', 'Forest', 'Forest', 'Forest'], quietOpponent),
      position(['Counterspell', 'Divination'], ['Island', 'Island', 'Island', 'Island'], (b) =>
        b
          .hand('Serra Angel', { count: 3 })
          .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
          .library('Serra Angel', { count: 10 }),
      ),
      position(
        [V1],
        [LIBRARY_LAMP.name, 'Island', 'Island', 'Island', 'Island'],
        quietOpponent,
        (b) => b.define(LIBRARY_LAMP),
      ),
    ];
    for (const g of positions) {
      const agent = new HeuristicAgent({ seed: 3 });
      await drive(g, agent, (_, l) => l.length >= 10);
      expect(agent.plans.length).toBeGreaterThan(0);
      for (const p of agent.plans) expect(p.value).toBeGreaterThanOrEqual(p.today);
    }
  });
});

describe('the work of a planning (issue 653)', () => {
  test('a planning counts its play-outs, views and engine actions; a clock that never moves cuts nothing', async () => {
    const g = position([V2, V3], ['Forest', 'Forest', 'Forest', 'Forest', 'Forest'], quietOpponent);
    const agent = new HeuristicAgent({ seed: 1 });
    await drive(g, agent, (_, l) => casts(l).length >= 1);
    const [work] = agent.plannings;
    expect(agent.plannings).toHaveLength(1);
    // The planning that ended in a plan is recorded once: its record is its work.
    expect(agent.plans[0]).toBe(work);
    expect(work?.planned).toBe(true);
    expect(work?.playOuts).toBeGreaterThan(1);
    // An engine step applies at most one action (none when a line took it before); every play-out's end is
    // viewed to score it.
    expect(work?.applies).toBeGreaterThan(0);
    expect(work?.applies).toBeLessThanOrEqual(work?.steps ?? 0);
    expect(work?.views).toBeGreaterThan(work?.playOuts ?? Number.POSITIVE_INFINITY);
    expect(work?.cut).toBeNull();
    expect(work?.ms).toBe(0);
  });

  test("lines that play the same turn up to the opponent's end step take those steps once", async () => {
    // Today's line and the ability line both pass through the agent's turn and the opponent's, and differ
    // only at the end step, where the ability line draws with the Lamp.
    const g = position([], [LIBRARY_LAMP.name, 'Island', 'Island', 'Island'], quietOpponent, (b) =>
      b.define(LIBRARY_LAMP),
    );
    const agent = new HeuristicAgent({ seed: 1 });
    await drive(g, agent, (_, l) => l.length >= 1);
    const [work] = agent.plannings;
    expect(work?.planned).toBe(true);
    expect(work?.applies).toBeLessThan(work?.steps ?? 0);
  });

  test('a planning that starts with the search share used up is cut by the clock and ends in no plan', async () => {
    const g = position([V2, V3], ['Forest', 'Forest', 'Forest', 'Forest', 'Forest'], quietOpponent);
    const agent = new HeuristicAgent({ seed: 1 });
    // The budget starts at 0 ms; every later read is 700 ms of a 1000 ms budget, past the search share.
    let reads = 0;
    const late = () => (reads++ === 0 ? 0 : 700);
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    await agent.decide(view, view.pending, {
      budgetMs: 1000,
      now: late,
      sample: (seed) => determinize(g.state, 0, createRng(seed)),
    });
    expect(agent.plans).toHaveLength(0);
    expect(agent.plannings).toEqual([
      {
        planned: false,
        playOuts: 0,
        deepPlayOuts: 0,
        deepUnits: 0,
        steps: 0,
        views: 0,
        applies: 0,
        cut: 'clock',
        ms: 0,
      },
    ]);
  });
});

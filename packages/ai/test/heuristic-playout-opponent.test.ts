// The opponents in play-outs (issue 653): inside every play-out of the look-ahead (the turn planner, its
// deepening, the combat look-ahead, the response look-ahead) an opponent attacks and blocks with the attack and
// block searches of the HeuristicAgent, on the play-out's own state, with a small budget of its own whose engine
// calls are paid from the decision's, and with no look-ahead of its own.
import {
  type Action,
  type ApplyResult,
  applyAction,
  createRng,
  determinize,
  type GameState,
  type GameView,
  getView,
  type SeatId,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  callCost,
  type Engine,
  INNER_BOUNDS,
  innerBudget,
  startBudget,
} from '../src/heuristic-budget';
import { Look } from '../src/heuristic-combat-look';
import type { SimAgents } from '../src/heuristic-plan-sim';
import { HeuristicAgent, simAgentsOf } from '../src/index';
import { DEFAULT_WEIGHTS } from '../src/weights';
import { creature } from './heuristic-helpers';

const V3 = 'SYNTHETIC Vanilla 3/3';
const FLIER = creature('SYNTHETIC Flier 3/3', 3, 3, ['flying']);
const WALL = creature('SYNTHETIC Vanilla 4/4', 4, 4);

/** Seat 0 at 10 life with a 3/3 flier and a 4/4, at its declare-attackers decision; seat 1 at 40 with four 3/3s. */
function table(): ScenarioGame {
  const g = scenario()
    .define(FLIER)
    .define(WALL)
    .seat(0)
    .life(10)
    .battlefield(FLIER.name, WALL.name)
    .library('Island', { count: 10 })
    .seat(1)
    .life(40)
    .battlefield(V3, V3, V3, V3)
    .library('Island', { count: 10 })
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

/** The inner agents as they were before: every decision answered from the view, the play-out's state unused. */
const viewOnly: SimAgents = {
  start: () => {
    const inner = new Map<SeatId, HeuristicAgent>();
    return (seat) => {
      const agent = inner.get(seat) ?? new HeuristicAgent({ seed: 7919 + seat });
      inner.set(seat, agent);
      return (view) => agent.decisionHandlers(view);
    };
  },
};

/** Seat 0's life at the start of its next turn, after its flier attacked, with `agents` deciding in the play-out. */
function lifeAfterFlierAttack(agents: SimAgents): number {
  const g = table();
  const sample = determinize(g.state, 0, createRng(1));
  const declared = applyAction(sample, 0, {
    kind: 'declareAttackers',
    attacks: [{ attacker: g.id(FLIER.name), target: { kind: 'player', seat: 1 } }],
  });
  if (!declared.ok) throw new Error('the attack was refused');
  const budget = startBudget({ budgetMs: 5000, now: () => 0 });
  const next = new Look(0, agents, budget, DEFAULT_WEIGHTS).next(declared.state);
  if (next === null) throw new Error('the play-out was dropped');
  return next.seats.find((s) => s.id === 0)?.life ?? Number.NaN;
}

/** An engine that writes down every state it is asked about (and counts their work units). */
function spyEngine(): Engine & { readonly states: GameState[]; units: number } {
  const states: GameState[] = [];
  const spy = {
    states,
    units: 0,
    view: (s: GameState, seat: SeatId): GameView => {
      states.push(s);
      spy.units += callCost(s);
      return getView(s, seat);
    },
    apply: (s: GameState, seat: SeatId, action: Action): ApplyResult => {
      states.push(s);
      spy.units += callCost(s);
      return applyAction(s, seat, action);
    },
  };
  return spy;
}

/** Seat 1's declare-attackers decision in its turn after seat 0 passed its own: the state and seat 1's view. */
function opponentAttack(): { state: GameState; view: GameView } {
  const g = table();
  g.choose({ kind: 'declareAttackers', attacks: [] });
  g.advanceTo('declareAttackers', { turn: 'next', attack: false });
  const state = determinize(g.state, 1, createRng(1));
  if (state.pending?.kind !== 'declareAttackers' || state.pending.seat !== 1) {
    throw new Error('seat 1 to declare attackers expected');
  }
  return { state, view: getView(state, 1) };
}

describe('the opponent in a play-out attacks with the attack search', () => {
  test('after the flier attacks, four 3/3s attack into the lone 4/4 and leave the agent at 1, where the old rule sent none', () => {
    // The old rule sends only attackers no block can kill, so it sees no crack-back here.
    expect(lifeAfterFlierAttack(viewOnly)).toBe(10);
    expect(lifeAfterFlierAttack(simAgentsOf(DEFAULT_WEIGHTS))).toBe(1);
  });

  test('the inner search plays the combat on the play-out state only: it starts no play-out of its own', () => {
    const { state, view } = opponentAttack();
    const spy = spyEngine();
    const handlers = simAgentsOf(DEFAULT_WEIGHTS).start()(1)(view, { state, engine: spy });
    const d = view.pending;
    if (d?.kind !== 'declareAttackers') throw new Error('declareAttackers expected');
    const action = handlers.declareAttackers(d);
    expect(action.kind === 'declareAttackers' && action.attacks.length).toBe(4);
    // It searched on the play-out's state ...
    expect(spy.states.length).toBeGreaterThan(10);
    // ... and never past the end of this combat: no look-ahead to the next turn inside a play-out.
    for (const s of spy.states) {
      expect(s.turn.number).toBe(state.turn.number);
      expect(s.turn.phase === 'combat' || s.turn.phase === 'beginning').toBe(true);
    }
    // Its work stays within its own bounds (a play-out overruns the limit by one step at most).
    expect(spy.units).toBeLessThan(INNER_BOUNDS.limit + 4 * callCost(state));
  });

  test('the inner budget counts every call, reads no clock and stops on its own bounds', () => {
    const { state } = opponentAttack();
    const spy = spyEngine();
    const budget = innerBudget(spy, { budget: 100, limit: 150 });
    expect(budget.search().expired(0)).toBeNull();
    for (let i = 0; i < 10; i += 1) budget.engine.view(state, 1);
    expect(budget.used()).toBe(10 * callCost(state));
    expect(budget.used()).toBeGreaterThan(150);
    expect(spy.units).toBe(budget.used());
    expect(budget.search().expired(1)).toBe('work');
    expect(budget.over()).toBe('work');
    expect(budget.elapsed()).toBe(0);
  });
});

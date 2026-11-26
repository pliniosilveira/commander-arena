// Combat look-ahead (issue 653, step 5): the attack and block searches play their best candidates on to the
// start of the agent's next turn, through the rest of this turn and the opponents' turn, with the inner
// agents deciding for every seat, and choose by what the board is worth then. The crack-back formula of
// `heuristic-crack-back.ts` is the fallback when the work budget is short.
import { createRng, determinize, type GameState, type SeatId } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { chooseHeuristicAttack } from '../src/heuristic-attacks';
import { chooseHeuristicBlocks } from '../src/heuristic-blocks';
import { startBudget, type WorkBounds } from '../src/heuristic-budget';
import { Look, lookSet, twoPlayers, untappedFor } from '../src/heuristic-combat-look';
import type { SimAgents } from '../src/heuristic-plan-sim';
import { HeuristicAgent } from '../src/index';
import { DEFAULT_WEIGHTS } from '../src/weights';
import { askHeuristic, lastReason } from './heuristic-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4 reach
// SYNTHETIC: a 5/5 that can't attack or block unless its controller has another creature with power 4 or more.
const SHY = 'SYNTHETIC Shy Colossus';

/** At 4 life with two Bears against a Shy Colossus, which can neither attack nor block. */
function colossus(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .life(4)
    .battlefield(BEARS, BEARS)
    .library('Island', { count: 6 })
    .seat(1)
    .battlefield(SHY)
    .library('Island', { count: 6 })
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

const simAgents: SimAgents = {
  start: () => {
    const inner = new Map<SeatId, HeuristicAgent>();
    return (seat) => {
      const agent = inner.get(seat) ?? new HeuristicAgent({ seed: 7919 + seat });
      inner.set(seat, agent);
      return (view) => agent.decisionHandlers(view);
    };
  },
};

/** The attack search on `g` with a work budget of `bounds`, with the look-ahead agents given or not. */
function attackWith(g: ScenarioGame, bounds: WorkBounds, agents: SimAgents | undefined) {
  const seat = g.deciding;
  const view = g.view(seat);
  const state: GameState = g.state;
  if (view.pending?.kind !== 'declareAttackers') throw new Error('declareAttackers expected');
  return chooseHeuristicAttack(view, view.pending, {
    sample: determinize(state, seat, createRng(1)),
    budget: startBudget({ budgetMs: 5000, now: () => 0 }, bounds),
    weights: DEFAULT_WEIGHTS,
    passiveWeight: 0.5,
    ...(agents === undefined ? {} : { agents }),
  });
}

const ROOMY: WorkBounds = { budget: 80_000, limit: 93_000 };

describe('the attack search looks to the next turn', () => {
  test('a creature that cannot attack is no crack-back: at 4 life two Bears still attack an empty board', async () => {
    // The formula counts every creature of the opponent as an attacker next turn; the play-out sees that the 5/5 cannot attack.
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(colossus(), agent);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(2);
    expect(lastReason(agent)?.reason).not.toBe('crack-back');
  });

  test('the decision says how many play-outs the look ran and whether it changed the choice', async () => {
    const agent = new HeuristicAgent({ seed: 1 });
    await askHeuristic(colossus(), agent);
    const look = agent.searches[0]?.look;
    expect(look?.playOuts).toBeGreaterThanOrEqual(2);
    // The formula alone keeps a Bear at home here: the look-ahead changed the choice.
    expect(look?.changed).toBe(true);
  });

  test('without the inner agents there is no look-ahead: the crack-back formula keeps a Bear home', () => {
    const choice = attackWith(colossus(), ROOMY, undefined);
    expect(choice.look).toBeUndefined();
    expect(choice.action.kind === 'declareAttackers' && choice.action.attacks).toHaveLength(1);
    expect(choice.reason).toBe('crack-back');
  });

  test('a work budget too short for the look-ahead keeps the choice of the search alone', () => {
    // Enough for the combat of each candidate, not for a candidate's next turn.
    const short: WorkBounds = { budget: 1_500, limit: 1_800 };
    const choice = attackWith(colossus(), short, simAgents);
    expect(choice.look).toBeUndefined();
    expect(choice.action.kind === 'declareAttackers' && choice.action.attacks).toHaveLength(1);
    expect(choice.reason).toBe('crack-back');
  });

  test('with three players the formula decides, as before', async () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .life(4)
      .battlefield(BEARS, BEARS)
      .library('Island', { count: 6 })
      .seat(1)
      .battlefield(SHY)
      .library('Island', { count: 6 })
      .seat(2)
      .library('Island', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(twoPlayers(g.view(0))).toBe(false);
    const agent = new HeuristicAgent({ seed: 1 });
    await askHeuristic(g, agent);
    expect(agent.searches[0]?.look).toBeUndefined();
  });
});

describe('the block search looks to the next turn', () => {
  /** The opponent attacks a Bears into the agent's untapped Spider; blockers are declared next. */
  function defend(): ScenarioGame {
    const g = scenario()
      .seat(0)
      .battlefield(SPIDER)
      .library('Island', { count: 6 })
      .seat(1)
      .battlefield(BEARS)
      .library('Island', { count: 6 })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack([BEARS]);
    g.advanceTo('declareBlockers', { block: false });
    return g;
  }

  test('the 2/4 spider blocks the 2/2 and the look ran', async () => {
    const g = defend();
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action.kind === 'declareBlockers' && action.blocks).toHaveLength(1);
    expect(agent.searches[0]?.look?.playOuts).toBeGreaterThanOrEqual(2);
  });

  test('without the inner agents there is no look-ahead and the block is the same', () => {
    const g = defend();
    const seat = g.deciding;
    const view = g.view(seat);
    if (view.pending?.kind !== 'declareBlockers') throw new Error('declareBlockers expected');
    const sample = determinize(g.state, seat, createRng(1));
    const choice = chooseHeuristicBlocks(view, view.pending, {
      sample,
      budget: startBudget({ budgetMs: 5000, now: () => 0 }, ROOMY),
      weights: DEFAULT_WEIGHTS,
    });
    expect(choice.look).toBeUndefined();
    expect(choice.action.kind === 'declareBlockers' && choice.action.blocks).toHaveLength(1);
  });
});

describe('the pieces of the look-ahead', () => {
  test('a state is played on to the start of the next turn of the agent', () => {
    const g = colossus();
    const budget = startBudget({ budgetMs: 5000, now: () => 0 }, ROOMY);
    const look = new Look(0, simAgents, budget, DEFAULT_WEIGHTS);
    const declared = budget.engine.apply(g.state, 0, { kind: 'declareAttackers', attacks: [] });
    if (!declared.ok) throw new Error('refused');
    const view = look.next(declared.state);
    expect(view?.activeSeat).toBe(0);
    expect(view?.turn).toBe(g.state.turn.number + 2);
    expect(look.playOuts).toBe(1);
  });

  test('the agent own creatures are untapped before the position is scored', () => {
    const g = colossus();
    const tapped = {
      ...g.view(0),
      battlefield: g.view(0).battlefield.map((o) => ({ ...o, tapped: true })),
    };
    const own = untappedFor(tapped, 0).battlefield.filter((o) => o.controller === 0);
    expect(own.every((o) => !o.tapped)).toBe(true);
    const theirs = untappedFor(tapped, 0).battlefield.filter((o) => o.controller === 1);
    expect(theirs.every((o) => o.tapped)).toBe(true);
  });

  test('"home" and the best two others within the margin are looked at', () => {
    const values = new Map([
      ['home', 0],
      ['a', 10],
      ['b', 9],
      ['c', 8.5],
      ['d', 2],
    ]);
    const ranked = ['a', 'b', 'c', 'd', 'home'];
    const value = (t: string): number => values.get(t) ?? 0;
    expect(lookSet(ranked, 'home', value, 3)).toEqual(['home', 'a', 'b']);
    expect(lookSet(ranked, 'home', value, 0.5)).toEqual(['home', 'a']);
    expect(lookSet(['home'], 'home', value, 3)).toEqual(['home']);
  });
});

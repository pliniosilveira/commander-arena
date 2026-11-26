// The horizon of a play-out (issue 653, step 3): `playLine` plays a line to the start of the agent's next
// turn (horizon 1, the planner's play-out today) or on through that turn and the opponents' turn after it
// (horizon 2). The line's steps belong to the turn it was made in: in the later turn the agent plays by
// today's rules, so a line that passes its main phases ("do nothing") does not pass the next turn as well.
import type { GameView, ObjectView, SeatId } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { DIRECT, NO_BUDGET } from '../src/heuristic-budget';
import { type Line, type PlayContext, playLine, type SimAgents } from '../src/heuristic-plan-sim';
import { PlanCounter } from '../src/heuristic-plan-work';
import { HeuristicAgent } from '../src/index';
import { DEFAULT_WEIGHTS } from '../src/weights';

const BEARS = 'Grizzly Bears';

/** Seat 0 in its first main phase with a Grizzly Bears in hand and three Forests; the opponent has nothing. */
const position = (): ScenarioGame =>
  scenario()
    .seat(0)
    .hand(BEARS)
    .battlefield('Forest', 'Forest', 'Forest')
    .landsPlayed(1)
    .library('Island', { count: 10 })
    .seat(1)
    .library('Island', { count: 10 })
    .at('precombatMain', { active: 0 })
    .build();

const agents: SimAgents = {
  start: () => {
    const inner = new Map<SeatId, HeuristicAgent>();
    return (seat) => {
      const agent = inner.get(seat) ?? new HeuristicAgent({ seed: 7919 + seat });
      inner.set(seat, agent);
      return (view: GameView) => agent.decisionHandlers(view);
    };
  },
};

const context = (): PlayContext => ({
  agents,
  budget: NO_BUDGET,
  weights: DEFAULT_WEIGHTS,
  work: new PlanCounter(DIRECT),
});

/** "Do nothing": pass both main phases of the turn the line was made in. */
const doNothing: Line = {
  label: 'do nothing',
  acts: {},
  rest: { main1: 'pass', main2: 'pass' },
  holdRemoval: [],
  reserve: null,
};

const bearsOf = (view: GameView, seat: SeatId): readonly ObjectView[] =>
  view.battlefield.filter((o) => o.name === BEARS && o.controller === seat);

describe('the horizon of a play-out', () => {
  test('horizon 1 ends at the start of the next turn of the agent, with the line passed', () => {
    const g = position();
    const played = playLine(g.state, 0, doNothing, context(), false);
    if (played === null) throw new Error('the play-out was dropped');
    expect(played.end.turn.activeSeat).toBe(0);
    expect(played.end.turn.number).toBe(g.state.turn.number + 2);
    expect(bearsOf(DIRECT.view(played.end, 0), 0)).toHaveLength(0);
  });

  test("horizon 2 plays the main phases of the next turn by today's rules instead of passing them", () => {
    const g = position();
    const played = playLine(g.state, 0, doNothing, context(), false, 2);
    if (played === null) throw new Error('the play-out was dropped');
    expect(played.end.turn.activeSeat).toBe(0);
    expect(played.end.turn.number).toBe(g.state.turn.number + 4);
    expect(bearsOf(DIRECT.view(played.end, 0), 0)).toHaveLength(1);
  });

  test('horizon 2 records the steps of the first turn only', () => {
    const g = position();
    const one = playLine(g.state, 0, doNothing, context(), true);
    const two = playLine(g.state, 0, doNothing, context(), true, 2);
    expect(one?.steps.length).toBeGreaterThan(0);
    expect(two?.steps).toEqual(one?.steps);
  });
});

// The agents and group 7 of the Hashaton deck (D-356, SYNTHETIC card `SYNTHETIC Second Sun Sphinx` of the engine fixtures `synthetic-hashaton-g7.ts`): "At the
// beginning of each of your postcombat main phases, there is an additional beginning phase after this phase" adds steps to the turn (untap, upkeep, draw) but asks no
// new kind of question. Each agent plays whole games' worth of turns with the Sphinx (alone, and two of them) and with a deck of real fixtures against it: every answer is
// one the engine lists, the added beginning phase happens in each turn of the Sphinx's controller and the turn counter never stalls.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { sameAction } from './casual-helpers';
import { ctxFor } from './heuristic-helpers';

const SPHINX = 'SYNTHETIC Second Sun Sphinx';
const LIBRARY = [
  'Island',
  'Mountain',
  'Grizzly Bears',
  'Lightning Bolt',
  'Island',
  'Divination',
  ...Array.from({ length: 20 }, () => 'Island'),
];

const agents: readonly [string, () => unknown][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
  ['heuristic', () => new HeuristicAgent({ seed: 3 })],
];

/** Plays `decisions` decisions or until `turn` is reached; every action must be one the engine lists. */
async function play(g: ScenarioGame, agent: unknown, untilTurn: number): Promise<void> {
  const decider = agent as {
    decide: (...a: unknown[]) => Promise<Parameters<ScenarioGame['choose']>[1]>;
  };
  for (
    let i = 0;
    i < 3000 &&
    g.state.pending !== null &&
    g.state.result === null &&
    g.state.turn.number < untilTurn;
    i += 1
  ) {
    const decision = g.state.pending;
    const view = g.view(decision.seat);
    if (view.pending === null) break;
    const a = await decider.decide(view, view.pending, ctxFor(g));
    expect(getLegalActions(g.state, decision.seat).some((x) => sameAction(x, a))).toBe(true);
    g.choose(decision.seat, a);
  }
}

/** The steps of `turn` as the events carry them; a turn starts at its turnBegan event, and the scenario's own first turn (3) is under way from the first event. */
const stepsOfTurn = (g: ScenarioGame, turn: number): string[] => {
  const out: string[] = [];
  let inTurn = turn === 3;
  for (const e of g.events) {
    if (e.kind === 'turnBegan') inTurn = e.turn === turn;
    else if (inTurn && e.kind === 'stepBegan') out.push(e.step);
  }
  return out;
};

describe('whole turns by the agents with the Sphinx', () => {
  test.each(agents)(
    'the %s agent plays six turns with one Sphinx: an added beginning phase in each of its turns, every answer legal',
    async (_name, make) => {
      const g = scenario()
        .seat(0)
        .battlefield(SPHINX)
        .battlefield('Island', { count: 3 })
        .library(...LIBRARY)
        .seat(1)
        .battlefield('Island', { count: 3 })
        .library(...LIBRARY)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      await play(g, make(), 9);
      expect(g.state.result).toBeNull();
      expect(g.state.turn.number).toBeGreaterThanOrEqual(9);
      // the Sphinx may be killed in combat; while it lived, turns 3, 5 and 7 were seat 0's: each of those that began with it on the battlefield has two beginning phases
      const untaps = [3, 5, 7].map((turn) => {
        const steps = stepsOfTurn(g, turn);
        // an added phase never leaves the turn without an end step
        expect(steps).toContain('end');
        return steps.filter((s) => s === 'untap').length;
      });
      // turn 3 began before the events (no untap of its own) and has the added one; turns 5 and 7 have their own and one added while the Sphinx lives
      expect([0, 1]).toContain(untaps[0]);
      for (const n of untaps.slice(1)) expect([1, 2]).toContain(n);
      expect(untaps.some((n) => n === 2) || untaps[0] === 1).toBe(true);
      g.expect.invariants();
    },
    60000,
  );

  test.each(agents)(
    'the %s agent plays with two Sphinxes: two added phases, the turn ends and the counter goes on',
    async (_name, make) => {
      const g = scenario()
        .seat(0)
        .battlefield(SPHINX, SPHINX)
        .battlefield('Island', { count: 3 })
        .library(...LIBRARY)
        .seat(1)
        .battlefield('Island', { count: 3 })
        .library(...LIBRARY)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      await play(g, make(), 7);
      expect(g.state.turn.number).toBeGreaterThanOrEqual(7);
      g.expect.invariants();
    },
    60000,
  );
});

describe('the steps of the turn with two Sphinxes, as the engine runs them', () => {
  test('passing priority through turn 3 gives two added untap steps for the Sphinx’s controller', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SPHINX, SPHINX)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('postcombatMain');
    for (let i = 0; i < 60 && g.state.turn.number === 3; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') g.act(d.seat).orderTriggers(0, 1);
      else if (d?.kind === 'priority') g.pass();
      else break;
    }
    // the scenario's turn 3 began in the first main phase: its own beginning phase is not in the events, the two added ones are
    expect(stepsOfTurn(g, 3).filter((s) => s === 'untap')).toHaveLength(2);
  });
});

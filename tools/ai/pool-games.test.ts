// Parallel play-outs on real boards (issue 653, step 2c): the HeuristicAgent plays the first turns of a real
// precon with a pool of workers and without one, and the two games are the same, action for action, with the
// same plannings (their work and what they chose). The pool is in process and answers out of order, through the
// same `PlanService` the web app's worker script runs and through JSON, as a worker's messages are. The
// property is proven on small boards by the unit test of the package (`packages/ai/test/heuristic-plan-pool.test.ts`);
// this is the same on the 100-card decks, where plannings are cut by the work budget.
import {
  GreedyAgent,
  HeuristicAgent,
  type PlanJobSpec,
  PlanService,
  type PlayOutJob,
  type PlayOutPool,
  type PlayOutTrace,
  runGame,
  simAgentsOf,
} from '@commander-arena/ai';
import { describe, expect, test } from 'vitest';
import { loadPreconDecks } from './precons.ts';

class InProcessPool implements PlayOutPool {
  readonly size = 4;
  runs = 0;
  private calls = 0;

  open(spec: PlanJobSpec): PlayOutJob {
    const service = new PlanService(simAgentsOf);
    service.open(1, structuredClone(spec));
    return {
      run: async (line, scenario, record, _group, horizon) => {
        this.runs += 1;
        this.calls += 1;
        for (let i = 0; i < (this.calls * 7) % 5; i += 1) await Promise.resolve();
        return JSON.parse(
          JSON.stringify(service.run(1, line, scenario, record, horizon)),
        ) as PlayOutTrace;
      },
      close: () => service.close(1),
    };
  }
}

const timeless = (record: object): object =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'ms' && k !== 'elapsed'));

// Two games of seven turns on a 100-card deck: nightly, not in the PR tier.
const gamesDescribe = process.env.TEST_TIER === 'pr' ? describe.skip : describe;

gamesDescribe('a precon game with a pool of workers', () => {
  test('is the game played on one thread, with the same plannings', async () => {
    const { decks } = await loadPreconDecks();
    const deck = decks[0]?.deck;
    if (deck === undefined) throw new Error('no precon snapshot');
    const play = async (pool?: PlayOutPool) => {
      const heuristic = new HeuristicAgent({ seed: 3 });
      const game = await runGame(
        { seed: 5, decks: [deck, deck] },
        [heuristic, new GreedyAgent({ seed: 4 })],
        {
          maxTurns: 7,
          maxActions: 1500,
          ...(pool === undefined ? {} : { playOuts: pool }),
        },
      );
      return {
        log: game.log,
        turn: game.state.turn.number,
        counters: game.counters,
        plannings: heuristic.plannings.map(timeless),
        plans: heuristic.plans.map(timeless),
        searches: heuristic.searches.map(timeless),
      };
    };
    const alone = await play();
    const pool = new InProcessPool();
    const together = await play(pool);
    expect(alone.plans.length).toBeGreaterThan(2);
    expect(pool.runs).toBeGreaterThan(alone.plans.length);
    expect(together.counters.fallbacks).toBe(0);
    expect(together).toEqual(alone);
  }, 300_000);
});

/**
 * The time budget of the AI in the host (SPEC 9, A28, D-164): the host hands the agent its budget and its
 * injected clock, the HeuristicAgent reads time only through that clock, and an answer far past the budget
 * is replaced and counted, with the slower agent too.
 */
import {
  type Agent,
  DEFAULT_BUDGET_MS,
  type DecideContext,
  HeuristicAgent,
  RandomLegalAgent,
} from '@commander-arena/ai';
import type { GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { DEFAULT_MARGIN_MS, GameHost } from '../src/game/host';
import type { AiKind, Snapshot } from '../src/game/protocol';

const options = { seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' };

/** Keeps the human seat moving with a random policy until `limit` answers or the game ends. */
async function playOn(host: GameHost, ai: AiKind, limit: number): Promise<Snapshot> {
  let snap = (await host.newGame({ ...options, ai })).snapshot;
  const human = new RandomLegalAgent({ seed: 99 });
  for (let n = 0; n < limit && snap.view.result === null; n++) {
    const decision = snap.view.pending;
    if (decision === null) throw new Error('the human has nothing pending');
    snap = await host.act(
      await human.decide(snap.view, decision, { budgetMs: 1000, now: () => 0 }),
    );
    expect(snap.error).toBeNull();
  }
  return snap;
}

test('the agent gets the configured budget, the host clock and a sample of the real state', async () => {
  const contexts: DecideContext[] = [];
  const clock = () => 42;
  const inner = new RandomLegalAgent({ seed: 1 });
  const host = new GameHost({
    clock,
    aiBudgetMs: 321,
    makeAgent: () => ({
      name: 'spy',
      decide(view, decision, ctx) {
        contexts.push(ctx);
        return inner.decide(view, decision, ctx);
      },
    }),
  });
  await playOn(host, 'normal', 40);
  expect(contexts.length).toBeGreaterThan(0);
  for (const ctx of contexts) {
    expect(ctx.budgetMs).toBe(321);
    expect(ctx.now).toBe(clock);
  }
  const sample: GameState | undefined = contexts[0]?.sample?.(5);
  expect(sample).toBeDefined();
});

test('the default budget is 5 s and the watchdog margin is half of it (D-172)', () => {
  // Pinned so that the numbers cannot drift silently: the budget is a cap, the margin keeps the
  // 50% ratio of the earlier 1000 ms and 500 ms, and an answer is replaced after 7500 ms.
  expect(DEFAULT_BUDGET_MS).toBe(5000);
  expect(DEFAULT_MARGIN_MS).toBe(2500);
  expect(DEFAULT_MARGIN_MS / DEFAULT_BUDGET_MS).toBe(0.5);
});

test('the default budget reaches the agent as DEFAULT_BUDGET_MS', async () => {
  const seen: number[] = [];
  const inner = new RandomLegalAgent({ seed: 1 });
  const host = new GameHost({
    clock: () => 0,
    makeAgent: () => ({
      name: 'spy',
      decide(view, decision, ctx) {
        seen.push(ctx.budgetMs);
        return inner.decide(view, decision, ctx);
      },
    }),
  });
  await playOn(host, 'normal', 10);
  expect(new Set(seen)).toEqual(new Set([DEFAULT_BUDGET_MS]));
});

/** An agent that spends `ms` of the injected clock on every answer. */
function spender(ms: number, clockRef: { t: number }): Agent {
  const inner = new RandomLegalAgent({ seed: 1 });
  return {
    name: 'spender',
    async decide(view, decision, ctx) {
      clockRef.t += ms;
      return inner.decide(view, decision, ctx);
    },
  };
}

test('an answer inside budget plus margin is kept; one past it is replaced and counted (A28)', async () => {
  const keep = { t: 0 };
  const kept = await playOn(
    new GameHost({
      clock: () => keep.t,
      aiBudgetMs: 1000,
      aiMarginMs: 500,
      makeAgent: () => spender(1500, keep),
    }),
    'normal',
    40,
  );
  expect(kept.aiFallbacks).toBe(0);

  const late = { t: 0 };
  const replaced = await playOn(
    new GameHost({
      clock: () => late.t,
      aiBudgetMs: 1000,
      aiMarginMs: 500,
      makeAgent: () => spender(1501, late),
    }),
    'normal',
    40,
  );
  expect(replaced.aiFallbacks).toBeGreaterThan(0);
});

test('the HeuristicAgent reads time only through the host clock, and the host margin holds', async () => {
  // A clock that moves 100 ms on every read: only an agent that reads it moves it. The real clock is
  // never consulted by the agent (the lint plugin bans Date.now and performance.now in packages/ai).
  let reads = 0;
  let t = 0;
  const clock = () => {
    reads += 1;
    t += 100;
    return t;
  };
  const snap = await playOn(
    new GameHost({ clock, makeAgent: (seed) => new HeuristicAgent({ seed }) }),
    'normal',
    120,
  );
  expect(reads, 'the agent read the host clock').toBeGreaterThan(0);
  expect(snap.aiFallbacks).toBe(0);
});

test('with a slow clock the search stops at 60% of the budget and the answer still lands', async () => {
  // 750 ms per read against the 5000 ms default budget: the search share (3000 ms) is used after a few reads, so
  // the agent takes the best candidate so far. Its decision spans a handful of reads, which the host
  // sees as well under budget plus margin, so nothing is replaced.
  let t = 0;
  const snap = await playOn(
    new GameHost({
      clock: () => {
        t += 750;
        return t;
      },
      makeAgent: (seed) => new HeuristicAgent({ seed }),
    }),
    'normal',
    80,
  );
  expect(snap.aiFallbacks).toBe(0);
});

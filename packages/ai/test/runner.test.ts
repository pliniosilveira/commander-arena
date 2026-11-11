// Tests for runGame and replayGame: what agents are handed, caps, rejection handling, fallbacks
// counted, and replay from the log.
import {
  type Action,
  applyAction,
  createGame,
  type GameView,
  type PendingDecision,
  stateHash,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  type Agent,
  DEFAULT_BUDGET_MS,
  type DecideContext,
  RandomLegalAgent,
  replayGame,
  runGame,
} from '../src/index';
import { smallGameConfig } from './helpers';

const LIMITS = { maxTurns: 150, maxActions: 5000 };
const random = (seed: number) => new RandomLegalAgent({ seed });

describe('runGame', () => {
  test('hands each agent its own view and decision, the budget and the clock', async () => {
    const calls: { view: GameView; decision: PendingDecision; ctx: DecideContext }[] = [];
    const recorder = (seed: number): Agent => {
      const inner = random(seed);
      return {
        name: 'recorder',
        decide: (view, decision, ctx) => {
          calls.push({ view, decision, ctx });
          return inner.decide(view, decision, ctx);
        },
      };
    };
    let ticks = 0;
    const now = () => {
      ticks += 1;
      return ticks;
    };
    const run = await runGame(smallGameConfig(7), [recorder(1), recorder(2)], {
      ...LIMITS,
      budgetMs: 250,
      now,
    });
    expect(run.reason).toBe('result');
    expect(calls).toHaveLength(run.counters.decisions);
    for (const { view, decision, ctx } of calls) {
      expect(view.pending).toBe(decision);
      expect(view.viewer).toBe(decision.seat);
      expect(ctx.budgetMs).toBe(250);
      expect(ctx.now).toBe(now);
    }
    // Both seats were asked, not just one.
    expect(new Set(calls.map((c) => c.view.viewer))).toEqual(new Set([0, 1]));
  });

  test('defaults to a 5000 ms budget and a logical clock', async () => {
    let seen: DecideContext | null = null;
    const inner = random(1);
    const spy: Agent = {
      name: 'spy',
      decide: (view, decision, ctx) => {
        seen ??= ctx;
        return inner.decide(view, decision, ctx);
      },
    };
    await runGame(smallGameConfig(8), [spy, spy], { maxTurns: 150, maxActions: 40 });
    expect(seen).not.toBeNull();
    const ctx = seen as unknown as DecideContext;
    expect(ctx.budgetMs).toBe(DEFAULT_BUDGET_MS);
    expect(ctx.budgetMs).toBe(5000);
    expect(typeof ctx.now()).toBe('number');
  });

  test('finishes with a result and a log that replays to the same state', async () => {
    const config = smallGameConfig(11);
    const run = await runGame(config, [random(5), random(6)], LIMITS);
    expect(run.reason).toBe('result');
    expect(run.result).not.toBeNull();
    expect(run.result).toBe(run.state.result);
    expect(run.log.length).toBe(run.state.actionCount);
    expect(run.counters).toEqual({
      fallbacks: 0,
      rejectedActions: 0,
      decisions: run.log.length,
    });
    expect(stateHash(replayGame(config, run.log))).toBe(stateHash(run.state));
  });

  test('stops at the action cap and at the turn cap without a result', async () => {
    const byActions = await runGame(smallGameConfig(3), [random(1), random(2)], {
      maxTurns: 150,
      maxActions: 25,
    });
    expect(byActions.reason).toBe('action-cap');
    expect(byActions.result).toBeNull();
    expect(byActions.log).toHaveLength(25);

    const byTurns = await runGame(smallGameConfig(3), [random(1), random(2)], {
      maxTurns: 2,
      maxActions: 5000,
    });
    expect(byTurns.reason).toBe('turn-cap');
    expect(byTurns.result).toBeNull();
    expect(byTurns.state.turn.number).toBeGreaterThan(2);
  });

  test('records an engine rejection, plays the first legal action and keeps going', async () => {
    const inner = random(9);
    let n = 0;
    const clumsy: Agent = {
      name: 'clumsy',
      decide: (view, decision, ctx) => {
        n += 1;
        // Every 5th answer names an object that does not exist.
        if (n % 5 === 0) return Promise.resolve({ kind: 'castSpell', object: 'o99999' } as Action);
        return inner.decide(view, decision, ctx);
      },
    };
    const config = smallGameConfig(21);
    const run = await runGame(config, [clumsy, random(10)], LIMITS);
    expect(run.counters.rejectedActions).toBeGreaterThan(0);
    expect(run.rejected).toHaveLength(run.counters.rejectedActions);
    for (const r of run.rejected) {
      expect(r.action).toEqual({ kind: 'castSpell', object: 'o99999' });
      expect(r.error.length).toBeGreaterThan(0);
      // The rejected action never reached the log, so the log replays cleanly.
      expect(run.log.slice(r.atAction, r.atAction + 1)[0]?.action).not.toEqual(r.action);
    }
    expect(run.reason).toBe('result');
    expect(stateHash(replayGame(config, run.log))).toBe(stateHash(run.state));
  });

  test('an agent that throws or rejects is a counted fallback, not a crash', async () => {
    const inner = random(3);
    let n = 0;
    const flaky: Agent = {
      name: 'flaky',
      decide: (view, decision, ctx) => {
        n += 1;
        if (n % 9 === 0) return Promise.reject(new Error('thinking failed'));
        if (n % 13 === 0) throw new Error('synchronous failure');
        return inner.decide(view, decision, ctx);
      },
    };
    const run = await runGame(smallGameConfig(5), [flaky, random(4)], LIMITS);
    expect(run.reason).toBe('result');
    expect(run.agentErrors.length).toBeGreaterThan(0);
    expect(run.agentErrors.some((e) => e.includes('thinking failed'))).toBe(true);
    expect(run.agentErrors.some((e) => e.includes('synchronous failure'))).toBe(true);
    expect(run.counters.fallbacks).toBe(run.agentErrors.length);
  });

  test('counts the fallbacks an agent records itself, per game', async () => {
    const throwing = new RandomLegalAgent({
      seed: 1,
      handlerOverrides: {
        discard: () => {
          throw new Error('cannot discard');
        },
        mulliganBottom: () => {
          throw new Error('cannot bottom');
        },
      },
    });
    // Seat 1 takes mulligans only through its own decks, so hunt for a seed that needs a handler.
    let fallbacks = 0;
    for (let seed = 1; seed <= 60 && fallbacks === 0; seed += 1) {
      const before = throwing.fallbacks.length;
      const run = await runGame(smallGameConfig(seed), [throwing, random(2)], LIMITS);
      fallbacks = run.counters.fallbacks;
      expect(fallbacks).toBe(throwing.fallbacks.length - before);
      expect(run.reason).toBe('result');
    }
    expect(fallbacks).toBeGreaterThan(0);
    // A seed search plays whole games, and which seed first needs a handler moves with every engine
    // change: it is slow by nature, so it has an explicit timeout rather than the 5 s default.
  }, 60_000);
});

describe('replayGame', () => {
  test('rebuilds the game from the seed and the log using applyAction only', async () => {
    const config = smallGameConfig(31);
    const run = await runGame(config, [random(1), random(2)], LIMITS);
    const replayed = replayGame(config, run.log);
    expect(stateHash(replayed)).toBe(stateHash(run.state));
    expect(replayed.result).toEqual(run.result);
  });

  test('a prefix of the log gives the state at that point', async () => {
    const config = smallGameConfig(32);
    const run = await runGame(config, [random(1), random(2)], LIMITS);
    const half = run.log.slice(0, Math.floor(run.log.length / 2));
    let state = createGame(config).state;
    for (const { seat, action } of half) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(stateHash(replayGame(config, half))).toBe(stateHash(state));
    expect(replayGame(config, half).result).toBeNull();
  });

  test('throws when the engine rejects a logged action', () => {
    const config = smallGameConfig(33);
    expect(() => replayGame(config, [{ seat: 0, action: { kind: 'declineCommandZone' } }])).toThrow(
      /action 0 .* was rejected/,
    );
  });

  test('a different seed does not reproduce the log', async () => {
    const config = smallGameConfig(34);
    const run = await runGame(config, [random(1), random(2)], LIMITS);
    const other = { ...config, seed: config.seed + 1 };
    // Same decks, another shuffle: the log either is rejected or ends in a different state.
    let hash: string | null = null;
    try {
      hash = stateHash(replayGame(other, run.log));
    } catch {
      hash = null;
    }
    expect(hash).not.toBe(stateHash(run.state));
  });
});

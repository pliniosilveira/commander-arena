// The pool of play-out workers (issue 653, step 2c): scheduling, the failures it survives, and that a game the
// host plays with it is the game it plays without it. The workers here are in process: each runs the same
// `PlanService` as `play-out.worker.ts`, receives structured clones and answers later, out of order.
import {
  DEFAULT_WEIGHTS,
  type Line,
  PlanService,
  type PlayOutTrace,
  RandomLegalAgent,
  simAgentsOf,
} from '@commander-arena/ai';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import {
  overrideFromName,
  overrideFromParams,
  type PoolReply,
  type PoolRequest,
  type PoolWorker,
  poolSizeFor,
  WorkerPlayOutPool,
  workerNameFor,
} from '../src/game/play-out-pool';

/** A worker that answers through `setTimeout`, so replies arrive after the pool has moved on. */
class FakeWorker implements PoolWorker {
  onmessage: ((event: { readonly data: PoolReply }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  readonly received: PoolRequest[] = [];
  terminated = false;
  mode: 'ok' | 'throw' | 'silent' | 'crash' = 'ok';
  private readonly service = new PlanService(simAgentsOf);
  private readonly delay: number;

  constructor(delay = 0) {
    this.delay = delay;
  }

  postMessage(message: PoolRequest): void {
    const data = structuredClone(message);
    this.received.push(data);
    if (data.t === 'open') {
      this.service.open(data.job, data.spec);
    } else if (data.t === 'close') {
      this.service.close(data.job);
    } else {
      setTimeout(() => this.answer(data), this.delay);
    }
  }

  private answer(data: Extract<PoolRequest, { t: 'run' }>): void {
    if (this.terminated || this.mode === 'silent') return;
    if (this.mode === 'crash') {
      this.onerror?.(new Error('script error'));
      return;
    }
    let reply: PoolReply;
    try {
      if (this.mode === 'throw') throw new Error('engine threw');
      const trace = this.service.run(data.job, data.line, data.scenario, data.record);
      reply = { t: 'done', id: data.id, trace: JSON.parse(JSON.stringify(trace)) as PlayOutTrace };
    } catch (error) {
      reply = { t: 'failed', id: data.id, message: (error as Error).message };
    }
    this.onmessage?.({ data: reply });
  }

  terminate(): void {
    this.terminated = true;
  }
}

/** A tiny planning: the start state of a one-scenario job and three lines of a main phase, from the test DSL. */
async function planningOf() {
  const { scenario } = await import('@commander-arena/engine/testing');
  const g = scenario()
    .seat(0)
    .hand('Grizzly Bears', 'SYNTHETIC Vanilla 2/2')
    .battlefield('Forest', 'Forest', 'Forest', 'Forest')
    .landsPlayed(1)
    .library('Island', { count: 10 })
    .seat(1)
    .library('Island', { count: 10 })
    .at('precombatMain', { active: 0 })
    .build();
  const line = (label: string, objects: readonly string[]): Line => ({
    label,
    acts: { main1: objects.map((name) => ({ kind: 'castSpell', object: g.id(name) })) },
    rest: { main1: 'pass', main2: 'pass' },
    holdRemoval: [],
    reserve: null,
  });
  const lines = [
    line('today', ['Grizzly Bears']),
    line('other', ['SYNTHETIC Vanilla 2/2']),
    line('both', ['Grizzly Bears', 'SYNTHETIC Vanilla 2/2']),
    line('nothing', []),
  ];
  return { lines, spec: { me: 0, weights: DEFAULT_WEIGHTS, lines, scenarios: [g.state] } };
}

const spawnOf =
  (workers: FakeWorker[], delay = 0) =>
  () => {
    const w = new FakeWorker(delay);
    workers.push(w);
    return w;
  };

describe('how many workers', () => {
  test('a device leaves one processor to the page and gets 2 to 4 workers, or none', () => {
    expect(poolSizeFor(undefined)).toBe(0);
    expect(poolSizeFor(1)).toBe(0);
    expect(poolSizeFor(2)).toBe(0);
    expect(poolSizeFor(3)).toBe(2);
    expect(poolSizeFor(5)).toBe(4);
    expect(poolSizeFor(64)).toBe(4);
  });

  test('the page can set the number for a test or a measurement', () => {
    expect(poolSizeFor(2, 3)).toBe(3);
    expect(poolSizeFor(64, 9)).toBe(4);
    expect(poolSizeFor(64, 1)).toBe(0);
    expect(poolSizeFor(64, 0)).toBe(0);
    expect(overrideFromName(workerNameFor(3))).toBe(3);
    expect(overrideFromName(workerNameFor(null))).toBeNull();
    expect(overrideFromParams(new URLSearchParams('workers=2'))).toBe(2);
    expect(overrideFromParams(new URLSearchParams('workers=x'))).toBeNull();
    expect(overrideFromParams(new URLSearchParams(''))).toBeNull();
  });
});

describe('the pool', () => {
  test('answers each play-out with the trace the planning service gives, on any worker', async () => {
    const { spec, lines } = await planningOf();
    const workers: FakeWorker[] = [];
    const pool = new WorkerPlayOutPool({ size: 3, spawn: spawnOf(workers) });
    const job = pool.open(spec);
    const alone = new PlanService(simAgentsOf);
    alone.open(1, spec);
    const ids = lines.map((_, i) => i);
    const traces = await Promise.all(ids.map((i) => job.run(i, 0, i === 0)));
    for (const i of ids)
      expect(traces[i]).toEqual(JSON.parse(JSON.stringify(alone.run(1, i, 0, i === 0))));
    expect(workers).toHaveLength(3);
    // More than one worker took part, and each was sent the planning once.
    const busy = workers.filter((w) => w.received.some((m) => m.t === 'run'));
    expect(busy.length).toBeGreaterThan(1);
    for (const w of busy) expect(w.received.filter((m) => m.t === 'open')).toHaveLength(1);
    job.close();
    for (const w of busy) expect(w.received.filter((m) => m.t === 'close')).toHaveLength(1);
  });

  test('workers start on the first planning, not before', async () => {
    const workers: FakeWorker[] = [];
    const pool = new WorkerPlayOutPool({ size: 2, spawn: spawnOf(workers) });
    expect(workers).toHaveLength(0);
    const { spec } = await planningOf();
    pool.open(spec);
    expect(workers).toHaveLength(2);
  });

  test('closing a planning drops what has not started and never answers what was running', async () => {
    const { spec, lines } = await planningOf();
    const workers: FakeWorker[] = [];
    const pool = new WorkerPlayOutPool({ size: 2, spawn: spawnOf(workers, 5) });
    const job = pool.open(spec);
    let settled = 0;
    for (let i = 0; i < 8; i += 1) {
      void job.run(i % lines.length, 0, false).then(
        () => {
          settled += 1;
        },
        () => {
          settled += 1;
        },
      );
    }
    job.close();
    await new Promise((r) => setTimeout(r, 40));
    // Two were running; the other six never started; none of the eight was answered.
    const runs = workers.flatMap((w) => w.received.filter((m) => m.t === 'run'));
    expect(runs).toHaveLength(2);
    expect(settled).toBe(0);
    // The pool is free for the next planning.
    const next = pool.open(spec);
    expect((await next.run(0, 0, true)).outcome).toBe('end');
  });

  test('a play-out a worker fails is rejected for the planner to play itself, and the worker goes on', async () => {
    const { spec } = await planningOf();
    const workers: FakeWorker[] = [];
    const pool = new WorkerPlayOutPool({ size: 2, spawn: spawnOf(workers) });
    const job = pool.open(spec);
    for (const w of workers) w.mode = 'throw';
    await expect(job.run(0, 0, true)).rejects.toThrow('engine threw');
    for (const w of workers) w.mode = 'ok';
    expect((await job.run(0, 0, true)).outcome).toBe('end');
  });

  test('a worker that crashes or goes silent is given up; with none left the pool refuses new planning', async () => {
    const { spec } = await planningOf();
    const workers: FakeWorker[] = [];
    const pool = new WorkerPlayOutPool({ size: 2, spawn: spawnOf(workers), timeoutMs: 30 });
    const job = pool.open(spec);
    const [a, b] = workers as [FakeWorker, FakeWorker];
    a.mode = 'crash';
    b.mode = 'silent';
    await expect(job.run(0, 0, true)).rejects.toThrow();
    await expect(job.run(1, 0, false)).rejects.toThrow();
    // Both are gone: queued and later requests are rejected, and a new planning cannot open.
    await expect(job.run(2, 0, false)).rejects.toThrow();
    expect(a.terminated && b.terminated).toBe(true);
    expect(() => pool.open(spec)).toThrow();
  });

  test('a worker that cannot start is no worker', async () => {
    const { spec } = await planningOf();
    const pool = new WorkerPlayOutPool({
      size: 2,
      spawn: () => {
        throw new Error('no Worker here');
      },
    });
    expect(() => pool.open(spec)).toThrow();
  });
});

describe('a game on the host with the pool', () => {
  test('is the game the host plays without it', async () => {
    const options = {
      seed: 7,
      humanDeck: 'white-knights',
      aiDeck: 'swamp-forest',
      ai: 'normal',
    } as const;
    const play = async (host: GameHost) => {
      let snap = (await host.newGame(options)).snapshot;
      const human = new RandomLegalAgent({ seed: 99 });
      const log: unknown[] = [];
      for (let i = 0; i < 90 && snap.view.result === null; i += 1) {
        const decision = snap.view.pending;
        if (decision === null) break;
        const action = await human.decide(snap.view, decision, { budgetMs: 1000, now: () => 0 });
        snap = await host.act(action);
        expect(snap.error).toBeNull();
        log.push(snap.log.map((l) => JSON.stringify(l)));
      }
      return { turn: snap.view.turn, log };
    };
    const workers: FakeWorker[] = [];
    const pool = new WorkerPlayOutPool({ size: 3, spawn: spawnOf(workers) });
    const alone = await play(new GameHost({ clock: () => 0 }));
    const together = await play(new GameHost({ clock: () => 0, playOuts: pool }));
    expect(together).toEqual(alone);
    // The workers did play out lines of the AI's turns.
    expect(workers.flatMap((w) => w.received).some((m) => m.t === 'run')).toBe(true);
  }, 120_000);
});

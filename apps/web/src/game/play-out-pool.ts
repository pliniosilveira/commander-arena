/**
 * The pool of play-out workers (issue 653, step 2c): the host's `PlayOutPool` (`@commander-arena/ai`,
 * `DecideContext.playOuts`) on 2 to 4 Web Workers. The game Worker owns the pool and the workers are its
 * children (`play-out.worker.ts`), so the page never sees them.
 *
 * What the pool does is scheduling and nothing else: the planner decides what to play out and in what
 * order, a worker plays it with the same code (`PlanService`) and answers a trace, and the planner settles
 * the traces in its own order (`heuristic-plan-trace.ts`), so the game is the one a single thread plays.
 *
 * - A planning is a JOB: its plain data (the scenarios' start states, the lines, the weights) goes to a worker
 *   once, the first time that worker is given one of its play-outs, and the worker keeps it until the job is
 *   closed. Requests go out one at a time to each idle worker, oldest first, and a request carries a GROUP
 *   (`PlayOutJob.run`): a worker takes the waiting requests of its groups before those of others, because
 *   play-outs of one group share what the worker's memo kept (see `pump`).
 * - Closing a job drops the requests not started and ignores the answers of those running (they are never
 *   resolved: nothing waits for them). A worker finishes the play-out it is on first.
 * - A worker that fails (it cannot start, throws out of its script, or does not answer within `timeoutMs`) is
 *   given up for good and its running request is rejected; the planner plays a rejected request itself. With
 *   no worker left `open` throws and the planner plays on its own thread. So a pool that breaks makes the
 *   planning slower and never different.
 */
import type { PlanJobSpec, PlayOutJob, PlayOutPool, PlayOutTrace } from '@commander-arena/ai';

/** The most workers a pool has (2 to 4 are used: the owner's decision for step 2c). */
export const MAX_WORKERS = 4;

/** How long a worker may take for one play-out before it is given up (a play-out is bounded by its steps). */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * How many workers a device gets: `override` (`?workers=` of the page, for tests and measurements) when given,
 * otherwise one less than its logical processors (the page keeps one), at most `MAX_WORKERS`. Fewer than 2
 * means no pool: one worker would only add the cost of sending the states.
 */
export function poolSizeFor(hardware: number | undefined, override: number | null = null): number {
  const wanted = override ?? (hardware === undefined ? 0 : hardware - 1);
  const size = Math.min(MAX_WORKERS, Math.max(0, Math.floor(wanted)));
  return size < 2 ? 0 : size;
}

/**
 * The page tells the game Worker how many play-out workers to start through the Worker's name (`?workers=<n>`:
 * a test seam and the way to measure; without it the device decides). `0` or `1` turns the pool off.
 */
const NAME_PREFIX = 'game:workers=';

export const workerNameFor = (override: number | null): string =>
  override === null ? 'game' : `${NAME_PREFIX}${override}`;

export function overrideFromName(name: string): number | null {
  if (!name.startsWith(NAME_PREFIX)) return null;
  const n = Number(name.slice(NAME_PREFIX.length));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** The `?workers=<n>` of the page, or null. */
export function overrideFromParams(params: URLSearchParams): number | null {
  const value = params.get('workers');
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** What the pool sends a worker. */
export type PoolRequest =
  | { readonly t: 'open'; readonly job: number; readonly spec: PlanJobSpec }
  | {
      readonly t: 'run';
      readonly id: number;
      readonly job: number;
      readonly line: number;
      readonly scenario: number;
      readonly record: boolean;
    }
  | { readonly t: 'close'; readonly job: number };

/** What a worker answers to a `run`. */
export type PoolReply =
  | { readonly t: 'done'; readonly id: number; readonly trace: PlayOutTrace }
  | { readonly t: 'failed'; readonly id: number; readonly message: string };

/** The part of a Worker the pool uses (a test gives its own). */
export interface PoolWorker {
  postMessage(message: PoolRequest): void;
  terminate(): void;
  onmessage: ((event: { readonly data: PoolReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
}

export interface PoolOptions {
  readonly size: number;
  /** Starts one worker. */
  readonly spawn: () => PoolWorker;
  readonly timeoutMs?: number;
}

interface Pending {
  readonly id: number;
  readonly job: Job;
  readonly line: number;
  readonly scenario: number;
  readonly record: boolean;
  readonly group: number;
  readonly resolve: (trace: PlayOutTrace) => void;
  readonly reject: (error: Error) => void;
}

interface Slot {
  readonly worker: PoolWorker;
  alive: boolean;
  running: Pending | null;
  /** The jobs this worker has been sent. */
  readonly opened: Set<number>;
  timer: ReturnType<typeof setTimeout> | null;
}

interface Job extends PlayOutJob {
  readonly id: number;
  closed: boolean;
  /** The worker each group of play-outs belongs to (see `pump`). */
  readonly owners: Map<number, Slot>;
}

export class WorkerPlayOutPool implements PlayOutPool {
  readonly size: number;
  private readonly spawn: () => PoolWorker;
  private readonly timeoutMs: number;
  private slots: Slot[] | null = null;
  private readonly queue: Pending[] = [];
  private readonly specs = new Map<number, PlanJobSpec>();
  private nextJob = 0;
  private nextRequest = 0;
  private scheduled = false;

  constructor(options: PoolOptions) {
    this.size = options.size;
    this.spawn = options.spawn;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Starts the workers on first use, so a game that never plans (a casual opponent) costs none. */
  private start(): Slot[] {
    if (this.slots !== null) return this.slots;
    const slots: Slot[] = [];
    for (let i = 0; i < this.size; i += 1) {
      try {
        slots.push(this.slot(this.spawn()));
      } catch {
        // A worker that cannot start is no worker.
      }
    }
    this.slots = slots;
    return slots;
  }

  private slot(worker: PoolWorker): Slot {
    const slot: Slot = {
      worker,
      alive: true,
      running: null,
      opened: new Set(),
      timer: null,
    };
    worker.onmessage = (event) => this.reply(slot, event.data);
    worker.onerror = () => this.fail(slot, 'a play-out worker failed');
    worker.onmessageerror = () => this.fail(slot, 'a play-out worker sent a message that was lost');
    return slot;
  }

  warm(): void {
    this.start();
  }

  open(spec: PlanJobSpec): PlayOutJob {
    const slots = this.start();
    if (!slots.some((s) => s.alive)) throw new Error('no play-out worker is running');
    const id = this.nextJob;
    this.nextJob += 1;
    this.specs.set(id, spec);
    const job: Job = {
      id,
      closed: false,
      owners: new Map(),
      run: (line, scenario, record, group) =>
        new Promise<PlayOutTrace>((resolve, reject) => {
          if (job.closed) return;
          if (!(this.slots ?? []).some((slot) => slot.alive)) {
            reject(new Error('no play-out worker is running'));
            return;
          }
          this.nextRequest += 1;
          this.queue.push({
            id: this.nextRequest,
            job,
            line,
            scenario,
            record,
            group,
            resolve,
            reject,
          });
          this.soon();
        }),
      close: () => this.close(job),
    };
    return job;
  }

  private close(job: Job): void {
    if (job.closed) return;
    job.closed = true;
    this.specs.delete(job.id);
    for (let i = this.queue.length - 1; i >= 0; i -= 1) {
      if (this.queue[i]?.job === job) this.queue.splice(i, 1);
    }
    for (const slot of this.slots ?? []) {
      if (slot.alive && slot.opened.delete(job.id))
        slot.worker.postMessage({ t: 'close', job: job.id });
    }
  }

  /** Deals the queue out once the caller has queued all it has at the moment, so the groups are all seen. */
  private soon(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.pump();
    });
  }

  /**
   * Gives each idle worker the request it should take next, oldest first within these rules: a request of a
   * group the worker owns; else one of a group nobody owns, which the worker then owns (so a worker works
   * through its groups, and what its memo kept is used); else, when every waiting group is owned by another
   * worker, the oldest request, for the worker would only wait (it plays it cold, and owns nothing new).
   */
  private pump(): void {
    for (const slot of this.slots ?? []) {
      if (!slot.alive || slot.running !== null) continue;
      const ownedBy = (p: Pending): Slot | undefined => {
        const owner = p.job.owners.get(p.group);
        return owner?.alive === true ? owner : undefined;
      };
      let at = this.queue.findIndex((p) => ownedBy(p) === slot);
      if (at < 0) at = this.queue.findIndex((p) => ownedBy(p) === undefined);
      const claim = at >= 0;
      const [next] = this.queue.splice(at < 0 ? 0 : at, 1);
      if (next === undefined) return;
      if (claim) next.job.owners.set(next.group, slot);
      this.send(slot, next);
    }
  }

  private send(slot: Slot, request: Pending): void {
    const { job } = request;
    try {
      if (!slot.opened.has(job.id)) {
        const spec = this.specs.get(job.id);
        if (spec === undefined) return;
        slot.worker.postMessage({ t: 'open', job: job.id, spec });
        slot.opened.add(job.id);
      }
      slot.running = request;
      slot.timer = setTimeout(() => this.fail(slot, 'a play-out took too long'), this.timeoutMs);
      slot.worker.postMessage({
        t: 'run',
        id: request.id,
        job: job.id,
        line: request.line,
        scenario: request.scenario,
        record: request.record,
      });
    } catch (error) {
      this.fail(slot, error instanceof Error ? error.message : String(error));
    }
  }

  private reply(slot: Slot, reply: PoolReply): void {
    const request = slot.running;
    if (request === null || request.id !== reply.id) return;
    this.release(slot);
    if (!request.job.closed) {
      if (reply.t === 'done') request.resolve(reply.trace);
      else request.reject(new Error(reply.message));
    }
    this.pump();
  }

  private release(slot: Slot): void {
    if (slot.timer !== null) clearTimeout(slot.timer);
    slot.timer = null;
    slot.running = null;
  }

  /** Gives a worker up: its running request is rejected (the planner plays it) and the others go elsewhere. */
  private fail(slot: Slot, message: string): void {
    if (!slot.alive) return;
    slot.alive = false;
    const request = slot.running;
    this.release(slot);
    try {
      slot.worker.terminate();
    } catch {
      // Already gone.
    }
    if (request !== null && !request.job.closed) request.reject(new Error(message));
    if (!(this.slots ?? []).some((s) => s.alive)) {
      for (const p of this.queue.splice(0)) if (!p.job.closed) p.reject(new Error(message));
      return;
    }
    this.pump();
  }

  /** Ends every worker (the Worker is going away). */
  dispose(): void {
    for (const slot of this.slots ?? []) this.fail(slot, 'the pool was disposed');
    this.slots = [];
  }
}

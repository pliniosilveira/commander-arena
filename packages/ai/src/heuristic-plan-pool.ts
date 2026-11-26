/**
 * The turn planner on a pool of workers (issue 653, step 2c): the same `planning` as on the agent's own
 * thread, with each play-out handed to the pool instead of played, and its trace settled in the planner's
 * order (`heuristic-plan-trace.ts`), so what the planning decides and what it costs are the single thread's.
 *
 * The planning asks for its play-outs one at a time and in a fixed order (line by line, scenario by scenario);
 * the pool is asked a little ahead of it, so the workers are busy while the planner settles an answer. The
 * play-outs asked ahead that the budget then stops are never settled: the workers' work on them is lost, and
 * nothing else. A play-out the pool fails to answer is played on this thread with the same runner, so a
 * pool that crashes slows the planning down and never changes it.
 */
import type { GameView } from '@commander-arena/engine';
import type { Think } from './heuristic-budget';
import { type Planning, planning } from './heuristic-plan';
import { PlanRunner } from './heuristic-plan-runner';
import type { SimAgents } from './heuristic-plan-sim';
import { settle, TraceNode } from './heuristic-plan-trace';
import type {
  Line,
  PlanJobSpec,
  PlayOutJob,
  PlayOutPool,
  PlayOutTrace,
  Window,
} from './heuristic-plan-types';
import { PlanCounter } from './heuristic-plan-work';

/** How many play-outs are asked of the pool ahead of the one the planner settles, per worker. */
const AHEAD_PER_WORKER = 2;

/** Plans like `choosePlan`, with the play-outs run by `pool`. */
export async function choosePlanOn(
  view: GameView,
  now: Window,
  lines: readonly Line[],
  think: Think,
  agents: SimAgents,
  pool: PlayOutPool,
): Promise<Planning> {
  const work = new PlanCounter(think.budget.engine);
  const me = view.viewer;
  const gen = planning(view, now, lines, think, work);
  let spec: PlanJobSpec | null = null;
  let job: PlayOutJob | null = null;
  let local: PlanRunner | null = null;
  let roots: TraceNode[] = [];
  let width = 1;
  const asked = new Map<number, Promise<PlayOutTrace>>();
  const ownRunner = (): PlanRunner => {
    if (spec === null) throw new Error('no planning is open');
    local ??= new PlanRunner(spec, agents);
    return local;
  };
  const ask = (k: number): Promise<PlayOutTrace> => {
    const kept = asked.get(k);
    if (kept !== undefined) return kept;
    const line = Math.floor(k / width);
    const scenario = k % width;
    const record = scenario === 0;
    const own = (): PlayOutTrace => ownRunner().run(line, scenario, record);
    let answer: Promise<PlayOutTrace>;
    try {
      answer =
        job === null ? Promise.resolve().then(own) : job.run(line, scenario, record).catch(own);
    } catch {
      answer = Promise.resolve().then(own);
    }
    // A play-out asked ahead and never settled must not be an unhandled rejection.
    answer.catch(() => undefined);
    asked.set(k, answer);
    return answer;
  };
  try {
    let step = gen.next();
    while (!step.done) {
      const request = step.value;
      if (request.kind === 'open') {
        spec = { me, weights: think.weights, lines, scenarios: request.states };
        try {
          job = pool.open(spec);
        } catch {
          job = null;
        }
        roots = request.states.map(() => new TraceNode());
        width = Math.max(1, request.states.length);
        step = gen.next();
        continue;
      }
      const k = request.line * width + request.scenario;
      const total = lines.length * width;
      for (let a = k; a <= k + pool.size * AHEAD_PER_WORKER && a < total; a += 1) ask(a);
      const trace = await ask(k);
      step = gen.next(settle(work, think.budget, me, roots[request.scenario] as TraceNode, trace));
    }
    return step.value;
  } finally {
    job?.close();
  }
}

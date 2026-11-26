/**
 * The turn planner on a pool of workers (issue 653, step 2c): the same `planning` as on the agent's own
 * thread, with each play-out handed to the pool instead of played, and its trace settled in the planner's
 * order (`heuristic-plan-trace.ts`), so what the planning decides and what it costs are the single thread's.
 *
 * The planning asks for its play-outs one at a time and in a fixed order (line by line, scenario by scenario);
 * the pool is asked for all of them the planning can use at once, in that order, and each carries a GROUP
 * (the same scenario, and lines that start with the same action), so the pool can keep a group on one worker
 * and use what that worker's memo kept: a planning shares much of its work between lines, and workers that
 * played the lines in turn would each do it again. The deepening phase (`heuristic-plan-deep.ts`) asks its
 * play-outs the same way: a request of horizon 2 is played by the same code on a worker and settled on
 * `Budget.deep`, and the planner says which lines it is about to play on a scenario so they start together.
 * The play-outs asked ahead that the budget then stops are never settled: the workers' work on them is lost,
 * and nothing else. A play-out the pool fails to answer is played on this thread with the same runner, so a
 * pool that crashes slows the planning down and never changes it.
 */
import type { GameView } from '@commander-arena/engine';
import type { Think } from './heuristic-budget';
import { MAX_PLAY_OUTS, type Planning, planning } from './heuristic-plan';
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

/** The windows of a turn in the order they come. */
const WINDOWS: readonly Window[] = ['main1', 'attack', 'afterBlocks', 'main2', 'theirEnd'];

/** What lines that start alike have in common: the first action they take (the planning's memo shares the rest). */
function familyOf(line: Line): string {
  for (const w of WINDOWS) {
    const first = line.acts[w]?.[0];
    if (first !== undefined) return JSON.stringify(first);
  }
  return '';
}

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
  // The groups of play-outs that share a worker's memo: a scenario, and the lines that start with one action.
  const families = new Map<string, number>();
  const groupOf = (line: number, scenario: number): number => {
    const family = familyOf(lines[line] as Line);
    const id = families.get(family) ?? families.size;
    families.set(family, id);
    return id * width + scenario;
  };
  const ownRunner = (): PlanRunner => {
    if (spec === null) throw new Error('no planning is open');
    local ??= new PlanRunner(spec, agents);
    return local;
  };
  // A play-out of horizon 1 is asked of the pool as `k = line * width + scenario`; one of the deepening phase
  // (horizon 2) as that number plus all the play-outs of horizon 1 there can be.
  const keyOf = (line: number, scenario: number, horizon: number): number =>
    line * width + scenario + (horizon > 1 ? lines.length * width : 0);
  const ask = (line: number, scenario: number, horizon: number): Promise<PlayOutTrace> => {
    const k = keyOf(line, scenario, horizon);
    const kept = asked.get(k);
    if (kept !== undefined) return kept;
    // Only a play-out of the first turn writes down the steps of a plan, and only on the base scenario.
    const record = scenario === 0 && horizon === 1;
    const own = (): PlayOutTrace => ownRunner().run(line, scenario, record, horizon);
    let answer: Promise<PlayOutTrace>;
    try {
      answer =
        job === null
          ? Promise.resolve().then(own)
          : job.run(line, scenario, record, groupOf(line, scenario), horizon).catch(own);
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
      if (request.kind === 'ahead') {
        for (const line of request.lines) ask(line, request.scenario, 2);
        step = gen.next();
        continue;
      }
      // The pool is asked for every play-out the planning can use at once, in the planner's order: a worker
      // works through its group while the planner settles the first answers.
      const total = Math.min(lines.length * width, MAX_PLAY_OUTS);
      for (let a = 0; a < total; a += 1) ask(Math.floor(a / width), a % width, 1);
      const trace = await ask(request.line, request.scenario, request.horizon);
      const on = request.horizon > 1 ? think.budget.deep() : think.budget;
      step = gen.next(settle(work, on, me, roots[request.scenario] as TraceNode, trace));
    }
    return step.value;
  } finally {
    job?.close();
  }
}

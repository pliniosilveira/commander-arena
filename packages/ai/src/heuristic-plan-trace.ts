/**
 * Play-outs that run elsewhere (issue 653, step 2c). The turn planner (`heuristic-plan.ts`) scores its lines
 * by playing each on each threat scenario. A host with a pool of workers (`PlayOutPool`) lets them run in
 * parallel, and the games stay the ones the single thread plays, because the planner's decisions never
 * depend on where a play-out ran, only on what it COST in the decision's work budget, and that is read
 * from a TRACE:
 *
 * - a worker plays a line on a scenario with the same `playLine` and no budget, and answers with the trace
 *   of the play-out: for each engine step the key of the action it applied, the work one engine call on that
 *   state costs, whether it built a view, and the calls of an opponent's combat search inside the step
 *   (`SideCall`: that search is bounded by its own work, never by the decision's budget, so it is the same on
 *   both sides); and, when the play-out reached the next turn, the score of its end and the steps of its plan
 *   (a play-out is a pure function of the scenario, the line and the weights);
 * - the planner SETTLES the trace in the order the single thread would have played the play-outs: it replays
 *   the accounting of `playLine` and `PlanCounter` step by step against the budget (the check before each
 *   step, the work of each call that the planning has not kept, what it keeps, up to `KEEP`), so the work
 *   units, the plan counts, the cuts and the play-outs that are dropped come out the same as when the planner
 *   played them itself. A play-out the budget would have dropped at step k is dropped at step k; the worker
 *   that ran past it wasted that work, nothing more.
 *
 * What a planning keeps is a tree of the actions applied from each scenario's start state (`TraceNode`): the
 * single thread keeps states by identity, and a state is the same object exactly when it is reached by the
 * same actions from the same start.
 */
import type { SeatId } from '@commander-arena/engine';
import type { Budget } from './heuristic-budget';
import type { PlayOutTrace, PlayScore, SideCall } from './heuristic-plan-types';
import { KEEP, type PlanCounter } from './heuristic-plan-work';

/** What a planning has kept of the states reached from one start (see the module comment). */
export class TraceNode {
  /** The seats whose view of this state was built and kept. */
  readonly viewed = new Set<SeatId>();
  /** The states reached by an action (null: the engine refused it), by the key of the action. */
  readonly next = new Map<string, TraceNode | null>();
}

/**
 * Settles `trace` of a play-out from `root` in the planning's accounting (`work`) and the decision's
 * `budget`, as `playLine` and the planner would have counted it. Returns the play-out's result, or null
 * when it was dropped (the budget, a refused action, the step cap), with `work.stop` noted as it would
 * have been.
 */
export function settle(
  work: PlanCounter,
  budget: Budget,
  me: SeatId,
  root: TraceNode,
  trace: PlayOutTrace,
): PlayScore | null {
  let node = root;
  const view = (at: TraceNode, seat: SeatId, cost: number): void => {
    if (at.viewed.has(seat)) return;
    work.views += 1;
    budget.charge(cost);
    if (work.views <= KEEP) at.viewed.add(seat);
  };
  /** The state `key` leads to from `at` (null: the engine refused it), counted when the planning has not kept it. */
  const apply = (at: TraceNode, key: string, cost: number, ok: boolean): TraceNode | null => {
    const kept = at.next.get(key);
    if (kept !== undefined) return kept;
    work.applies += 1;
    budget.charge(cost);
    const child = ok ? new TraceNode() : null;
    if (work.applies <= KEEP) at.next.set(key, child);
    return child;
  };
  /** The calls of an opponent's search inside the step at `from`, numbered as `SideCall` says. */
  const side = (from: TraceNode, calls: readonly SideCall[]): void => {
    const states: TraceNode[] = [from];
    for (const call of calls) {
      if (call.op === 'fresh') {
        states.push(new TraceNode());
        continue;
      }
      const at = states[call.at];
      if (at === undefined)
        throw new Error(`a side call reads state ${call.at}, which it never reached`);
      if (call.op === 'view') {
        view(at, call.seat, call.cost);
      } else {
        const next = apply(at, call.key, call.cost, call.ok);
        if (next !== null) states.push(next);
      }
    }
  };
  for (const move of trace.moves) {
    const why = budget.over();
    if (why !== null) {
      work.stop(why);
      return null;
    }
    work.step();
    if (move.view) view(node, move.seat, move.cost);
    if (move.side !== undefined) side(node, move.side);
    if (move.key === null) continue;
    const next = apply(node, move.key, move.cost, move.ok);
    if (next === null) return null;
    node = next;
  }
  if (trace.outcome === 'maxsteps') {
    work.stop('work');
    return null;
  }
  if (trace.outcome !== 'end') return null;
  view(node, me, trace.endCost ?? 0);
  return { score: trace.score ?? 0, steps: trace.plan ?? [] };
}

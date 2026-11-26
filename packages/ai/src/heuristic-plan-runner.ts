/**
 * The worker side of parallel play-outs (issue 653, step 2c; see `heuristic-plan-trace.ts`): plays one line on
 * one scenario with the planner's own `playLine` and no budget, and answers the TRACE the planner settles.
 *
 * A `PlanRunner` holds the plain data of one planning (`PlanJobSpec`) and what its play-outs share, the
 * planning's memo (`PlanCounter`, bounded by `KEEP`), so lines that start alike are played once on a worker
 * too. A `PlanService` holds the runners of the plannings a worker has open: the one thing a worker script
 * has to do is route its messages to `open`, `run` and `close`. Pure code, no worker API: a test pool and the
 * planner's own fallback run it in process.
 */

import type { Action, ApplyResult, GameState, GameView, SeatId } from '@commander-arena/engine';
import { evaluate } from './evaluate';
import { type Cut, callCost, DIRECT, NO_BUDGET } from './heuristic-budget';
import { playLine, type SimAgents } from './heuristic-plan-sim';
import type { PlanJobSpec, PlayOutTrace, TraceMove } from './heuristic-plan-types';
import { keyOf, PlanCounter } from './heuristic-plan-work';
import type { AgentWeights } from './weights';

/** A move of the play-out being recorded (filled in as `playLine` takes its calls). */
interface OpenMove {
  seat: SeatId;
  cost: number;
  view: boolean;
  key: string | null;
  ok: boolean;
}

/** `playLine`'s counter, which also writes down each step: the moves of the trace. */
class Recorder extends PlanCounter {
  moves: OpenMove[] = [];
  stopped: Cut | null = null;
  /** False while the end state is scored: that view is not a step of the play-out. */
  recording = true;

  constructor() {
    super(DIRECT);
  }

  override step(): void {
    super.step();
    this.moves.push({ seat: 0, cost: 0, view: false, key: null, ok: true });
  }

  override view(state: GameState, seat: SeatId): GameView {
    const move = this.moves[this.moves.length - 1];
    if (this.recording && move !== undefined) {
      move.view = true;
      move.seat = seat;
      move.cost = callCost(state);
    }
    return super.view(state, seat);
  }

  override apply(state: GameState, seat: SeatId, action: Action): ApplyResult {
    const move = this.moves[this.moves.length - 1];
    const result = super.apply(state, seat, action);
    if (move !== undefined) {
      move.seat = seat;
      move.cost = callCost(state);
      move.key = keyOf(seat, action);
      move.ok = result.ok;
    }
    return result;
  }

  override stop(why: Cut): void {
    super.stop(why);
    this.stopped = why;
  }
}

/** The play-outs of one planning, on the data the planner sent. */
export class PlanRunner {
  private readonly recorder = new Recorder();
  private readonly spec: PlanJobSpec;
  private readonly agents: SimAgents;

  constructor(spec: PlanJobSpec, agents: SimAgents) {
    this.spec = spec;
    this.agents = agents;
  }

  /** Plays line `line` on scenario `scenario` to the agent's next turn and answers the trace. */
  run(line: number, scenario: number, record: boolean): PlayOutTrace {
    const { me, weights, lines, scenarios } = this.spec;
    const rec = this.recorder;
    rec.moves = [];
    rec.stopped = null;
    rec.recording = true;
    const start = scenarios[scenario];
    const played = lines[line];
    if (start === undefined || played === undefined) return { outcome: 'dropped', moves: [] };
    const result = playLine(
      start,
      me,
      played,
      { agents: this.agents, budget: NO_BUDGET, weights, work: rec },
      record,
    );
    const moves: readonly TraceMove[] = rec.moves;
    if (result === null) return { outcome: rec.stopped === 'work' ? 'maxsteps' : 'dropped', moves };
    rec.recording = false;
    const score = evaluate(rec.view(result.end, me), me, weights).score;
    return {
      outcome: 'end',
      moves,
      endCost: callCost(result.end),
      score,
      plan: result.steps,
    };
  }
}

/** The plannings a worker has open, by the id the pool gave them. */
export class PlanService {
  private readonly jobs = new Map<number, PlanRunner>();
  private readonly agentsOf: (weights: AgentWeights) => SimAgents;

  /** `agentsOf` builds the inner agents of a planning (`simAgentsOf`: it lives with the agent, which imports this). */
  constructor(agentsOf: (weights: AgentWeights) => SimAgents) {
    this.agentsOf = agentsOf;
  }

  open(id: number, spec: PlanJobSpec): void {
    this.jobs.set(id, new PlanRunner(spec, this.agentsOf(spec.weights)));
  }

  run(id: number, line: number, scenario: number, record: boolean): PlayOutTrace {
    const runner = this.jobs.get(id);
    if (runner === undefined) throw new Error(`no planning ${id} is open`);
    return runner.run(line, scenario, record);
  }

  close(id: number): void {
    this.jobs.delete(id);
  }
}

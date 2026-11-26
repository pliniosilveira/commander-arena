/**
 * The plain types the turn planner shares with the code that plays its lines elsewhere (issue 653, step 2c;
 * `heuristic-plan-trace.ts`): a line, a plan step, the trace of a play-out and the pool a host offers. In a
 * leaf module of their own, because `agent.ts` names the pool and imports nothing of the planner.
 */
import type { Action, GameState, ObjectId, SeatId } from '@commander-arena/engine';
import type { BoardPrint } from './heuristic-plan-print';
import type { AgentWeights } from './weights';

/** The moments of a turn a plan has steps for. */
export type Window = 'main1' | 'attack' | 'afterBlocks' | 'main2' | 'theirEnd';

/** One way to play the turn (see `heuristic-plan-lines.ts`). */
export interface Line {
  readonly label: string;
  /** The agent's actions in each window, in order. */
  readonly acts: Partial<Record<Window, readonly Action[]>>;
  /** What the agent does in a window once its actions are used up: pass, or today's rules (the default). */
  readonly rest: Partial<Record<Window, 'pass' | 'today'>>;
  /** Removal held for an opponent's attack. */
  readonly holdRemoval: readonly ObjectId[];
  /** Mana kept payable when the line's casts are paid (`payHolding`). */
  readonly reserve: readonly string[] | null;
}

export interface PlanStep {
  readonly when: Window;
  readonly action: Action;
  readonly expect: BoardPrint;
  readonly reserve: readonly string[] | null;
}

/** One engine step of a play-out, as the accounting needs it. */
export interface TraceMove {
  /** The seat whose decision the step answered (the seat of its view and its action). */
  readonly seat: SeatId;
  /** What one engine call on the state of this step costs (`callCost`). */
  readonly cost: number;
  /** Whether the step built a view (a step that only passes does not). */
  readonly view: boolean;
  /** The key of the action it applied (`keyOf`), or null when it applied none. */
  readonly key: string | null;
  /** Whether the engine accepted the action. */
  readonly ok: boolean;
}

/**
 * How a play-out ended: `end` (it reached the start of the agent's next turn, or the game's end), `dropped`
 * (the engine refused an action, or a handler failed) or `maxsteps` (the step cap).
 */
export type TraceOutcome = 'end' | 'dropped' | 'maxsteps';

export interface PlayOutTrace {
  readonly outcome: TraceOutcome;
  readonly moves: readonly TraceMove[];
  /** With `end`: what scoring the end state costs (`callCost` of it), its score, and the steps of the plan. */
  readonly endCost?: number;
  readonly score?: number;
  readonly plan?: readonly PlanStep[];
}

/** What a settled play-out gives the planner: the score of its end and the steps it took. */
export interface PlayScore {
  readonly score: number;
  readonly steps: readonly PlanStep[];
}

/** What a worker needs to play the lines of one planning: plain data, so it can be sent to a worker. */
export interface PlanJobSpec {
  readonly me: SeatId;
  readonly weights: AgentWeights;
  readonly lines: readonly Line[];
  /** The start state of each threat scenario, in the planner's order. */
  readonly scenarios: readonly GameState[];
}

/** One planning's play-outs on a pool: `run` plays one line on one scenario and answers its trace. */
export interface PlayOutJob {
  /**
   * `group` says which play-outs share what a worker keeps of them (the same scenario and lines that start
   * with the same action): the pool gives a group to one worker while it can, so that worker's memo is used.
   */
  run(line: number, scenario: number, record: boolean, group: number): Promise<PlayOutTrace>;
  /** The planning is over: play-outs not started are dropped and the workers' copies of the states freed. */
  close(): void;
}

/**
 * A pool of workers a host offers (`DecideContext.playOuts`). The agent uses it only when it holds two
 * or more, and plays on its own thread when a request fails, so a pool may be unreliable but never changes
 * a decision.
 */
export interface PlayOutPool {
  /** How many play-outs run at once. */
  readonly size: number;
  open(spec: PlanJobSpec): PlayOutJob;
}

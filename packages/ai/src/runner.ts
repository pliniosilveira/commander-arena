/**
 * The game runner (SPEC 9, 12): drives `createGame` and `applyAction` with one agent per seat.
 * Each agent receives only `getView(state, seat)` and its pending decision. Every returned action
 * goes through `applyAction`; an engine rejection is recorded and the runner plays the agent's
 * first safe legal action instead, so a game never stalls on a bad answer.
 */
import {
  type Action,
  applyAction,
  createGame,
  createRng,
  determinize,
  type GameConfig,
  type GameResult,
  type GameState,
  getView,
  type SeatId,
} from '@commander-arena/engine';
import { type Agent, DEFAULT_BUDGET_MS, type DecideContext } from './agent';
import { firstSafeAction } from './legal';

export interface LoggedAction {
  readonly seat: SeatId;
  readonly action: Action;
}

export interface RejectedAction extends LoggedAction {
  /** Index in the action log at which the agent answered (the log did not grow). */
  readonly atAction: number;
  readonly error: string;
}

export type EndReason =
  /** The game finished with a result (a win or a draw). */
  | 'result'
  | 'turn-cap'
  | 'action-cap'
  /** Not even the safe fallback action was accepted. Always an engine or runner bug. */
  | 'stuck';

export interface RunOptions {
  /** The run stops when the turn counter exceeds this. */
  readonly maxTurns: number;
  /** The run stops after this many applied actions. */
  readonly maxActions: number;
  /** Per-decision budget handed to agents, in milliseconds. Defaults to `DEFAULT_BUDGET_MS` (5000). */
  readonly budgetMs?: number;
  /**
   * Injected clock handed to agents. Defaults to a logical clock that counts decisions, because
   * the AI package may not read real time.
   */
  readonly now?: () => number;
}

export interface RunCounters {
  /** Fallbacks the agents recorded plus agent calls that threw or rejected (SPEC 9). */
  readonly fallbacks: number;
  /** Actions the engine refused (the runner then played the safe fallback). */
  readonly rejectedActions: number;
  /** Decisions handed to agents. */
  readonly decisions: number;
}

export interface GameRun {
  readonly state: GameState;
  readonly result: GameResult | null;
  readonly reason: EndReason;
  /** Every applied action, in order. `replayGame(config, log)` rebuilds the final state. */
  readonly log: readonly LoggedAction[];
  readonly rejected: readonly RejectedAction[];
  readonly counters: RunCounters;
  /** Messages of agent calls that threw or rejected. */
  readonly agentErrors: readonly string[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runGame(
  config: GameConfig,
  agents: readonly [Agent, Agent],
  options: RunOptions,
): Promise<GameRun> {
  let decisions = 0;
  const now = options.now ?? (() => decisions);
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const fallbacksAtStart = agents.map((a) => a.fallbacks?.length ?? 0);

  let state = createGame(config).state;
  const log: LoggedAction[] = [];
  const rejected: RejectedAction[] = [];
  const agentErrors: string[] = [];
  let reason: EndReason = 'result';

  while (state.result === null) {
    if (state.turn.number > options.maxTurns) {
      reason = 'turn-cap';
      break;
    }
    if (log.length >= options.maxActions) {
      reason = 'action-cap';
      break;
    }
    const pending = state.pending;
    if (pending === null) {
      reason = 'stuck';
      agentErrors.push('the game is running but nothing is pending');
      break;
    }
    const seat = pending.seat;
    const agent = agents[seat];
    if (agent === undefined) {
      reason = 'stuck';
      agentErrors.push(`no agent for seat ${seat}`);
      break;
    }
    const view = getView(state, seat);
    const decision = view.pending;
    if (decision === null) {
      reason = 'stuck';
      agentErrors.push(`the view of seat ${seat} lacks its own pending decision`);
      break;
    }

    decisions += 1;
    // The sample is built only when an agent asks for it, from the state and seat of this decision (A31).
    const realState = state;
    const ctx: DecideContext = {
      budgetMs,
      now,
      sample: (seed) => determinize(realState, seat, createRng(seed)),
    };
    let action: Action;
    try {
      action = await agent.decide(view, decision, ctx);
    } catch (error) {
      agentErrors.push(`${agent.name} threw: ${message(error)}`);
      action = firstSafeAction(decision);
    }
    let applied = applyAction(state, seat, action);
    if (!applied.ok) {
      rejected.push({ seat, action, atAction: log.length, error: applied.error });
      action = firstSafeAction(decision);
      applied = applyAction(state, seat, action);
      if (!applied.ok) {
        reason = 'stuck';
        agentErrors.push(`the fallback action was rejected too: ${applied.error}`);
        break;
      }
    }
    log.push({ seat, action });
    state = applied.state;
  }

  const agentFallbacks = agents.reduce(
    (sum, a, i) => sum + (a.fallbacks?.length ?? 0) - (fallbacksAtStart[i] ?? 0),
    0,
  );
  return {
    state,
    result: state.result,
    reason,
    log,
    rejected,
    counters: {
      fallbacks: agentFallbacks + agentErrors.length,
      rejectedActions: rejected.length,
      decisions,
    },
    agentErrors,
  };
}

/**
 * Rebuilds a game from its config (which holds the seed) and an action log, through `applyAction`
 * only. Throws if the engine rejects a logged action: a log from `runGame` never contains one.
 */
export function replayGame(config: GameConfig, log: readonly LoggedAction[]): GameState {
  let state = createGame(config).state;
  log.forEach((entry, index) => {
    const applied = applyAction(state, entry.seat, entry.action);
    if (!applied.ok) {
      throw new Error(
        `replay: action ${index} (${entry.action.kind}) was rejected: ${applied.error}`,
      );
    }
    state = applied.state;
  });
  return state;
}

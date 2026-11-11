/**
 * AI agents. Depends only on the engine's public API and never sees hidden information.
 */
export type { Agent, DecideContext, FallbackRecord } from './agent';
export { DEFAULT_BUDGET_MS } from './agent';
export {
  AGENT_FACTORIES,
  type AgentFactory,
  type AgentKind,
  MATCH_LIMITS,
  type MatchDeck,
  type MatchGame,
  type MatchOptions,
  type MatchResult,
  playMatch,
  type ReasonCounts,
  type Side,
} from './arena';
export { ARENA_DECKS } from './arena-decks';
export {
  CasualAgent,
  type CasualAgentOptions,
  createCasualHandlers,
} from './casual-agent';
export {
  type Evaluation,
  evaluate,
  lifeValue,
  type ScoreTerm,
} from './evaluate';
export { GreedyAgent, type GreedyAgentOptions } from './greedy-agent';
export { HeuristicAgent, type HeuristicAgentOptions } from './heuristic-agent';
export { firstSafeAction, preferredActions } from './legal';
export {
  createRandomHandlers,
  MIN_KEEP_SIZE,
  RandomLegalAgent,
  type RandomLegalAgentOptions,
} from './random-agent';
export {
  type ExplainingAgent,
  isExplaining,
  REASONS,
  type Reason,
  type ReasonRecord,
  reasonHistogram,
  summarizeAction,
} from './reasons';
export type {
  EndReason,
  GameRun,
  LoggedAction,
  RejectedAction,
  RunCounters,
  RunOptions,
} from './runner';
export { replayGame, runGame } from './runner';

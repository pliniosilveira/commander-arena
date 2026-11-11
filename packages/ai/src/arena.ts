/**
 * The match harness (M7b, PRIOR_ART 7.2 heuristic 10, SPEC 17.3 A11): plays two agents against each
 * other over paired seeds and reports who won, from which seat, how long it took, how often an agent
 * had to fall back and why the agents chose what they chose.
 *
 * PAIRED SEEDS. Each seed is played twice with the seats swapped: in the first game agent A sits in
 * seat 0 and agent B in seat 1, in the second the other way round, on the same game seed and the
 * same decks (a mirror: both seats play the same list). The game seed fixes the shuffles, so the two
 * games of a pair deal the same cards to seat 0 and to seat 1; each agent plays each seat of each
 * deal once. Compared on the same seeds, the agents face the same luck, which cuts the variance of
 * a win rate. It does not give an agent the same hand in both games (the seats draw from different
 * points of the seeded stream); the pairing balances seats and deals, not hands.
 *
 * Everything is deterministic: the game seed of pair `i` is `baseSeed + i`, the deck is
 * `decks[i % decks.length]`, and the agent seeds are derived from the game seed, the same for both
 * games of a pair. The harness reads no clock; `now` and the budget come from the run options.
 *
 * A game that ends without a result (the turn or action cap, or a stuck run) counts as `unfinished`,
 * not as a draw, so a stalled agent shows up instead of hiding in the draw column.
 */
import type { DeckConfig, SeatId } from '@commander-arena/engine';
import type { Agent } from './agent';
import { CasualAgent } from './casual-agent';
import { GreedyAgent } from './greedy-agent';
import { HeuristicAgent } from './heuristic-agent';
import { RandomLegalAgent } from './random-agent';
import { isExplaining, type Reason, type ReasonRecord, reasonHistogram } from './reasons';
import { type EndReason, type RunOptions, runGame } from './runner';

/** How to make an agent for a seed: one fresh agent per game. */
export interface AgentFactory {
  /** The name the report uses. */
  readonly label: string;
  readonly create: (seed: number) => Agent;
}

export const AGENT_FACTORIES = {
  random: { label: 'random', create: (seed) => new RandomLegalAgent({ seed }) },
  casual: { label: 'casual', create: (seed) => new CasualAgent({ seed }) },
  greedy: { label: 'greedy', create: (seed) => new GreedyAgent({ seed }) },
  heuristic: { label: 'heuristic', create: (seed) => new HeuristicAgent({ seed }) },
} as const satisfies Record<string, AgentFactory>;

export type AgentKind = keyof typeof AGENT_FACTORIES;

/** The limits of one game, as in the AI game tests. */
export const MATCH_LIMITS = { maxTurns: 150, maxActions: 5000 } as const;

export interface MatchOptions {
  readonly a: AgentFactory;
  readonly b: AgentFactory;
  /**
   * Deck lists, cycled by pair index. At least one. A `DeckConfig` is played as a mirror (both seats
   * play it); a pair `[seat 0 deck, seat 1 deck]` gives each seat its own list. The decks stay with
   * the SEAT: in the second game of a seed the agents swap seats and keep the decks where they were,
   * so each agent plays each deck once and each seat once.
   */
  readonly decks: readonly MatchDeck[];
  /**
   * The number of games to play: a positive even number, because every seed is played twice (the
   * seats swapped), so `games / 2` seeds are used.
   */
  readonly games: number;
  readonly baseSeed: number;
  /** Per-decision budget handed to the agents (the runner's default when absent). */
  readonly budget?: number;
  /**
   * The clock handed to the agents (the runner's logical clock, which counts decisions, when absent). A
   * clock that reads real time makes a result depend on the speed of the machine, so a win-rate run
   * leaves it out; the host of the web app and the timing report of `pnpm ai:arena --real-clock` give one.
   */
  readonly now?: () => number;
  /** The game limits (`MATCH_LIMITS` when absent). */
  readonly limits?: Pick<RunOptions, 'maxTurns' | 'maxActions'>;
}

/** One deck for both seats, or `[seat 0, seat 1]` (see `MatchOptions.decks`). */
export type MatchDeck = DeckConfig | readonly [DeckConfig, DeckConfig];

const decksOf = (deck: MatchDeck): [DeckConfig, DeckConfig] =>
  Array.isArray(deck) ? [deck[0], deck[1]] : [deck as DeckConfig, deck as DeckConfig];

export type Side = 'a' | 'b';

export interface MatchGame {
  readonly seed: number;
  readonly deck: number;
  /** The seat agent A sat in. */
  readonly aSeat: SeatId;
  /** The winner, or null for a draw or a game without a result. */
  readonly winner: Side | null;
  readonly end: EndReason;
  readonly drew: boolean;
  readonly turns: number;
}

export type ReasonCounts = Partial<Record<Reason, number>>;

export interface MatchResult {
  readonly a: string;
  readonly b: string;
  /** Games played. */
  readonly games: number;
  readonly wins: { readonly a: number; readonly b: number };
  /** Wins of the agent in each seat, by seat number: `winsBySeat[agent][seat]`. */
  readonly winsByAgentSeat: {
    readonly a: readonly [number, number];
    readonly b: readonly [number, number];
  };
  /** Wins of seat 0 and of seat 1, whichever agent sat there. */
  readonly winsBySeat: readonly [number, number];
  readonly draws: number;
  /** Games that ended without a result (a cap or a stuck run). */
  readonly unfinished: number;
  /** The mean of the turn counter at the end of the games. */
  readonly averageTurns: number;
  /** Fallbacks the agents took plus agent calls that threw, summed over every game. */
  readonly fallbacks: number;
  /** Actions the engine refused. */
  readonly rejectedActions: number;
  /** The reasons of the agents that explain themselves, counted by agent. */
  readonly reasons: { readonly a: ReasonCounts; readonly b: ReasonCounts };
  readonly log: readonly MatchGame[];
}

const add = (into: ReasonCounts, from: ReasonCounts): void => {
  for (const [reason, n] of Object.entries(from) as [Reason, number][]) {
    into[reason] = (into[reason] ?? 0) + n;
  }
};

const recordsOf = (agent: Agent): readonly ReasonRecord[] =>
  isExplaining(agent) ? agent.reasons : [];

export async function playMatch(options: MatchOptions): Promise<MatchResult> {
  if (options.decks.length === 0) throw new Error('playMatch needs at least one deck');
  if (!Number.isInteger(options.games) || options.games < 2 || options.games % 2 !== 0) {
    throw new Error(
      `playMatch plays each seed twice: games must be an even number, got ${options.games}`,
    );
  }
  const limits = options.limits ?? MATCH_LIMITS;
  const run: RunOptions = {
    ...limits,
    ...(options.budget === undefined ? {} : { budgetMs: options.budget }),
    ...(options.now === undefined ? {} : { now: options.now }),
  };
  const log: MatchGame[] = [];
  const wins = { a: 0, b: 0 };
  const byAgentSeat = { a: [0, 0], b: [0, 0] } as { a: [number, number]; b: [number, number] };
  const bySeat: [number, number] = [0, 0];
  const reasons = { a: {} as ReasonCounts, b: {} as ReasonCounts };
  let draws = 0;
  let unfinished = 0;
  let turns = 0;
  let fallbacks = 0;
  let rejectedActions = 0;

  for (let i = 0; i < options.games / 2; i += 1) {
    const seed = options.baseSeed + i;
    const deckIndex = i % options.decks.length;
    const decks = decksOf(options.decks[deckIndex] as MatchDeck);
    for (const aSeat of [0, 1] as const) {
      const a = options.a.create(2 * seed + 1);
      const b = options.b.create(2 * seed + 2);
      const agents = (aSeat === 0 ? [a, b] : [b, a]) as [Agent, Agent];
      const game = await runGame({ seed, decks }, agents, run);
      turns += game.state.turn.number;
      fallbacks += game.counters.fallbacks;
      rejectedActions += game.counters.rejectedActions;
      add(reasons.a, reasonHistogram(recordsOf(a)));
      add(reasons.b, reasonHistogram(recordsOf(b)));
      let winner: Side | null = null;
      if (game.result?.kind === 'win') {
        const seat = game.result.winner === 0 ? 0 : 1;
        winner = seat === aSeat ? 'a' : 'b';
        wins[winner] += 1;
        byAgentSeat[winner][seat] += 1;
        bySeat[seat] += 1;
      } else if (game.result?.kind === 'draw') {
        draws += 1;
      } else {
        unfinished += 1;
      }
      log.push({
        seed,
        deck: deckIndex,
        aSeat,
        winner,
        end: game.reason,
        drew: game.result?.kind === 'draw',
        turns: game.state.turn.number,
      });
    }
  }
  const games = options.games;
  return {
    a: options.a.label,
    b: options.b.label,
    games,
    wins,
    winsByAgentSeat: byAgentSeat,
    winsBySeat: bySeat,
    draws,
    unfinished,
    averageTurns: games === 0 ? 0 : turns / games,
    fallbacks,
    rejectedActions,
    reasons,
    log,
  };
}

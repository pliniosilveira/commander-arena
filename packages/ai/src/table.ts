/**
 * The table harness (issue 482): the match harness of `arena.ts` for three or four seats. One agent factory for each seat of the first game; every seed is played once for each
 * rotation of the agents, so each agent sits in every seat on the same shuffles (the two-seat harness swaps; a table rotates). With the same deck in every seat (a mirror), the
 * rotation balances seats and deals, as the swap does. Deterministic as `playMatch` is: the game seed of seed `i` is `baseSeed + i`, the deck is `decks[i % decks.length]` and the
 * agent seed of each seat is derived from the game seed and the seat, whichever agent sits there, so copies of one agent play the same game in every rotation (common random numbers, as in
 * `playMatch`). A game that ends without a result is `unfinished`, not a draw.
 */
import type { DeckConfig, SeatId } from '@commander-arena/engine';
import type { Agent } from './agent';
import { type AgentFactory, MATCH_LIMITS, type ReasonCounts } from './arena';
import { isExplaining, type Reason, type ReasonRecord, reasonHistogram } from './reasons';
import { type EndReason, type RunOptions, runGame } from './runner';
import { type TableEvent, TableObserver } from './table-events';

/** One deck for every seat (a mirror), or one deck for each seat, in seat order (issue 527: a precon for each seat). */
export type TableDeck = DeckConfig | readonly DeckConfig[];

export interface TableOptions {
  /** One factory for each seat of the first game: two to four. */
  readonly agents: readonly AgentFactory[];
  /**
   * Decks, cycled by seed. A `DeckConfig` is played by every seat (a mirror); an array gives each seat its own, in seat order, and stays with the SEAT when the agents rotate. At least one.
   */
  readonly decks: readonly TableDeck[];
  /** A positive multiple of the number of agents: each seed is played once for each rotation. */
  readonly games: number;
  readonly baseSeed: number;
  readonly budget?: number;
  readonly now?: () => number;
  readonly limits?: Pick<RunOptions, 'maxTurns' | 'maxActions'>;
  /** Keep the events of every game in `TableGame.events` (what `table-report.ts` reads). Off by default. */
  readonly trace?: boolean;
}

export interface TableGame {
  readonly seed: number;
  readonly deck: number;
  /** The seat of the first agent (the rotation); agent `k` sat in seat `(k + rotation) % seats`. */
  readonly rotation: number;
  /** The index of the agent that won, or null for a draw or a game without a result. */
  readonly winner: number | null;
  readonly winnerSeat: SeatId | null;
  readonly end: EndReason;
  readonly drew: boolean;
  readonly turns: number;
  /**
   * The place each SEAT finished in (1 is the winner; the first out of four is 4; every survivor of a game
   * without a winner shares 1), by seat. Use `rotation` to find the agent: agent `k` sat in seat `(k + rotation) % seats`.
   */
  readonly places: readonly number[];
  /** The seat that took the first turn (drawn at random by the engine), or null when no action was taken. */
  readonly startingSeat: SeatId | null;
  /** The events of the game, only when `TableOptions.trace` is on. */
  readonly events?: readonly TableEvent[];
}

export interface TableResult {
  /** The label of each agent, by index. */
  readonly labels: readonly string[];
  readonly seats: number;
  readonly games: number;
  /** Wins of each agent. */
  readonly wins: readonly number[];
  /** `winsByAgentSeat[agent][seat]`. */
  readonly winsByAgentSeat: readonly (readonly number[])[];
  /** Wins of each seat, whichever agent sat there. */
  readonly winsBySeat: readonly number[];
  readonly draws: number;
  readonly unfinished: number;
  readonly averageTurns: number;
  readonly fallbacks: number;
  readonly rejectedActions: number;
  /** The reasons of each agent that explains itself, by agent index. */
  readonly reasons: readonly ReasonCounts[];
  readonly log: readonly TableGame[];
}

const decksOf = (entry: TableDeck, seats: number): DeckConfig[] => {
  if (!Array.isArray(entry)) return Array.from({ length: seats }, () => entry as DeckConfig);
  if (entry.length !== seats) {
    throw new Error(`playTable has ${seats} seats but a deck entry lists ${entry.length} decks`);
  }
  return [...(entry as readonly DeckConfig[])];
};

const recordsOf = (agent: Agent): readonly ReasonRecord[] =>
  isExplaining(agent) ? agent.reasons : [];

export async function playTable(options: TableOptions): Promise<TableResult> {
  const seats = options.agents.length;
  if (seats < 2 || seats > 4) throw new Error(`playTable seats two to four agents, got ${seats}`);
  if (options.decks.length === 0) throw new Error('playTable needs at least one deck');
  if (!Number.isInteger(options.games) || options.games < seats || options.games % seats !== 0) {
    throw new Error(
      `playTable plays each seed once for each of ${seats} rotations: games must be a multiple of ${seats}, got ${options.games}`,
    );
  }
  const run: RunOptions = {
    ...(options.limits ?? MATCH_LIMITS),
    ...(options.budget === undefined ? {} : { budgetMs: options.budget }),
    ...(options.now === undefined ? {} : { now: options.now }),
  };
  const wins = options.agents.map(() => 0);
  const byAgentSeat = options.agents.map(() => Array.from({ length: seats }, () => 0));
  const bySeat = Array.from({ length: seats }, () => 0);
  const reasons = options.agents.map(() => ({}) as Partial<Record<Reason, number>>);
  const log: TableGame[] = [];
  let draws = 0;
  let unfinished = 0;
  let turns = 0;
  let fallbacks = 0;
  let rejectedActions = 0;

  for (let i = 0; i < options.games / seats; i += 1) {
    const seed = options.baseSeed + i;
    const deckIndex = i % options.decks.length;
    const entry = options.decks[deckIndex] as TableDeck;
    const decks = decksOf(entry, seats);
    for (let rotation = 0; rotation < seats; rotation += 1) {
      // The seed goes with the seat of agent k, not with the agent (see the header).
      const made = options.agents.map((factory, k) =>
        factory.create(seats * seed + ((k + rotation) % seats) + 1),
      );
      // Agent k sits in seat (k + rotation) % seats.
      const bySeatAgent = Array.from({ length: seats }, (_, seat) => {
        const k = (seat - rotation + seats) % seats;
        return made[k] as Agent;
      });
      const observer = new TableObserver(seats);
      const game = await runGame({ seed, decks }, bySeatAgent, {
        ...run,
        onAction: (step) => observer.observe(step),
      });
      turns += game.state.turn.number;
      fallbacks += game.counters.fallbacks;
      rejectedActions += game.counters.rejectedActions;
      for (const [k, agent] of made.entries()) {
        const into = reasons[k] as Partial<Record<Reason, number>>;
        for (const [reason, n] of Object.entries(reasonHistogram(recordsOf(agent))) as [
          Reason,
          number,
        ][]) {
          into[reason] = (into[reason] ?? 0) + n;
        }
      }
      let winner: number | null = null;
      let winnerSeat: SeatId | null = null;
      if (game.result?.kind === 'win') {
        winnerSeat = game.result.winner;
        winner = (winnerSeat - rotation + seats) % seats;
        wins[winner] = (wins[winner] ?? 0) + 1;
        const row = byAgentSeat[winner] as number[];
        row[winnerSeat] = (row[winnerSeat] ?? 0) + 1;
        bySeat[winnerSeat] = (bySeat[winnerSeat] ?? 0) + 1;
      } else if (game.result?.kind === 'draw') {
        draws += 1;
      } else {
        unfinished += 1;
      }
      log.push({
        seed,
        deck: deckIndex,
        rotation,
        winner,
        winnerSeat,
        end: game.reason,
        drew: game.result?.kind === 'draw',
        turns: game.state.turn.number,
        places: observer.placements(),
        startingSeat: observer.startingSeat(),
        ...(options.trace ? { events: observer.events } : {}),
      });
    }
  }
  return {
    labels: options.agents.map((a) => a.label),
    seats,
    games: options.games,
    wins,
    winsByAgentSeat: byAgentSeat,
    winsBySeat: bySeat,
    draws,
    unfinished,
    averageTurns: turns / options.games,
    fallbacks,
    rejectedActions,
    reasons,
    log,
  };
}

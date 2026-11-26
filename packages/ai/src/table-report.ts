/**
 * The measuring report of a table run (issue 482 follow-up): what each agent did in the games of a
 * `playTable` run made with `trace: true`, read from the events of `table-events.ts`. Pure: the same
 * result gives the same report, so a test pins it and two runs of the same seeds compare.
 *
 * Three questions, one block each, besides how the games ended:
 *  - survival: the place each agent finished in, when it went out and why;
 *  - the race: how often it sent everything it had, and whether it was out within a round of doing so;
 *  - blocks: the damage it let through and the part a free creature could have stopped;
 *  - removal: what its removal spells were aimed at, against the best target the table had.
 * Events are by SEAT; `rotation` says which agent sat there (agent `k` sat in seat `(k + rotation) % seats`).
 */
import type { TableGame, TableResult } from './table';
import type { EliminationCause } from './table-events';

/** `targetValue` bands of the removal report (`threatValue`: a vanilla 3/3 is worth about 5.5). */
export const VALUE_BANDS = [2, 4, 6] as const;

export interface SurvivalStats {
  readonly games: number;
  /** Mean place over the games (1 best); a survivor of a game without a winner counts as 1. */
  readonly meanPlace: number;
  /** Games in which the agent went out first. */
  readonly firstOut: number;
  /** Games in which the agent was eliminated, and the mean game turn it went out on. */
  readonly eliminated: number;
  readonly meanEliminationTurn: number | null;
  readonly causes: Readonly<Partial<Record<EliminationCause, number>>>;
}

export interface AttackStats {
  /** Declarations that sent at least one creature. */
  readonly attacks: number;
  readonly allIn: number;
  readonly meanPower: number;
  /** All-in attacks after which the attacker was out within one round of turns. */
  readonly allInThenOut: number;
  /** Attacks at a player: the main target (the one given the most power) had the least life among the opponents, ties included, or did not. */
  readonly atLowest: number;
  readonly notLowest: number;
  /** Attacks whose main target was one of several opponents tied for the least life, and how many of those went at the lowest seat number among them. */
  readonly ties: number;
  readonly tiesAtLowestSeat: number;
  /** All-in attacks with some opponent's whole board able to deal the attacker's life next turn (`incoming` >= life), and those after which it was out within a round. */
  readonly exposedAllIn: number;
  readonly exposedAllInOut: number;
}

export interface BlockStats {
  /** Block declarations with at least one attacker aimed at the agent. */
  readonly declarations: number;
  /** ... in which nothing was blocked. */
  readonly noBlocks: number;
  readonly lethal: number;
  readonly unblocked: number;
  readonly avoidable: number;
  /** Declarations that let through at least this much avoidable damage, by the thresholds 5 and 10. */
  readonly avoidableAtLeast5: number;
  readonly avoidableAtLeast10: number;
}

export interface RemovalStats {
  readonly casts: number;
  readonly tokens: number;
  /** Targets by `targetValue` band: below 2, 2 to 4, 4 to 6, 6 and above. */
  readonly bands: readonly [number, number, number, number];
  /** Mean of `targetValue / bestValue` (1: it always took the best permanent). */
  readonly meanShareOfBest: number;
  /** Casts at a permanent that was attacking a player, and at one attacking the caster. */
  readonly atAttacker: number;
  readonly atAttackerOfMine: number;
}

export interface AgentReport {
  readonly label: string;
  readonly wins: number;
  readonly survival: SurvivalStats;
  readonly attack: AttackStats;
  readonly block: BlockStats;
  readonly removal: RemovalStats;
}

/** What happened to whoever sat in one seat, or in one place of the turn order, over the games. */
export interface PositionStats {
  readonly games: number;
  readonly wins: number;
  /** Mean place (1 best). */
  readonly meanPlace: number;
}

export interface TableReport {
  readonly seats: number;
  readonly games: number;
  readonly agents: readonly AgentReport[];
  /**
   * By seat number. The engine draws the first seat at random, so a gap here that is not in `byPosition`
   * comes from something tied to the seat number (a tie-break by seat, a deck bound to a seat), not from the turn order.
   */
  readonly bySeat: readonly PositionStats[];
  /** By place in the turn order: 0 took the first turn, 1 the second, and so on. Games without a recorded start are left out. */
  readonly byPosition: readonly PositionStats[];
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** The agent that sat in `seat` in `game`. */
const agentAt = (game: TableGame, seat: number, seats: number): number =>
  (seat - game.rotation + seats) % seats;

function survivalOf(games: readonly TableGame[], agent: number, seats: number): SurvivalStats {
  const places: number[] = [];
  const turns: number[] = [];
  const causes: Partial<Record<EliminationCause, number>> = {};
  let firstOut = 0;
  for (const g of games) {
    const seat = (agent + g.rotation) % seats;
    const place = g.places[seat] ?? 1;
    places.push(place);
    const out = (g.events ?? []).find((e) => e.kind === 'eliminated' && e.seat === seat);
    if (out?.kind === 'eliminated') {
      turns.push(out.turn);
      causes[out.cause] = (causes[out.cause] ?? 0) + 1;
      if (place === seats) firstOut += 1;
    }
  }
  return {
    games: games.length,
    meanPlace: mean(places),
    firstOut,
    eliminated: turns.length,
    meanEliminationTurn: turns.length === 0 ? null : mean(turns),
    causes,
  };
}

function attackOf(games: readonly TableGame[], agent: number, seats: number): AttackStats {
  let attacks = 0;
  let allIn = 0;
  let allInThenOut = 0;
  let atLowest = 0;
  let notLowest = 0;
  let ties = 0;
  let tiesAtLowestSeat = 0;
  let exposedAllIn = 0;
  let exposedAllInOut = 0;
  const power: number[] = [];
  for (const g of games) {
    const events = g.events ?? [];
    for (const e of events) {
      if (e.kind !== 'attack' || e.attackers === 0 || agentAt(g, e.seat, seats) !== agent) continue;
      attacks += 1;
      power.push(e.power);
      const out = events.find((x) => x.kind === 'eliminated' && x.seat === e.seat);
      const outSoon = out !== undefined && out.turn >= e.turn && out.turn - e.turn <= seats;
      // The main target: the player given the most power.
      const main = e.groups
        .filter((x) => x.seat !== null)
        .sort((a, b) => b.power - a.power || (a.seat ?? 0) - (b.seat ?? 0))[0];
      if (main !== undefined && e.opponents.length > 0) {
        const least = Math.min(...e.opponents.map((o) => o.life));
        if (main.life <= least) atLowest += 1;
        else notLowest += 1;
        const tied = e.opponents.filter((o) => o.life === least);
        if (tied.length > 1 && main.life === least) {
          ties += 1;
          if (main.seat === Math.min(...tied.map((o) => o.seat))) tiesAtLowestSeat += 1;
        }
      }
      if (!e.allIn) continue;
      allIn += 1;
      if (outSoon) allInThenOut += 1;
      if (Math.max(0, ...e.opponents.map((o) => o.incoming)) >= e.life) {
        exposedAllIn += 1;
        if (outSoon) exposedAllInOut += 1;
      }
    }
  }
  return {
    attacks,
    allIn,
    meanPower: mean(power),
    allInThenOut,
    atLowest,
    notLowest,
    ties,
    tiesAtLowestSeat,
    exposedAllIn,
    exposedAllInOut,
  };
}

function blockOf(games: readonly TableGame[], agent: number, seats: number): BlockStats {
  const s = { declarations: 0, noBlocks: 0, lethal: 0, unblocked: 0, avoidable: 0, a5: 0, a10: 0 };
  for (const g of games) {
    for (const e of g.events ?? []) {
      if (e.kind !== 'block' || e.attackersAtMe === 0 || agentAt(g, e.seat, seats) !== agent) {
        continue;
      }
      s.declarations += 1;
      if (e.blockers === 0) s.noBlocks += 1;
      if (e.lethal) s.lethal += 1;
      s.unblocked += e.unblocked;
      s.avoidable += e.avoidable;
      if (e.avoidable >= 5) s.a5 += 1;
      if (e.avoidable >= 10) s.a10 += 1;
    }
  }
  return {
    declarations: s.declarations,
    noBlocks: s.noBlocks,
    lethal: s.lethal,
    unblocked: s.unblocked,
    avoidable: s.avoidable,
    avoidableAtLeast5: s.a5,
    avoidableAtLeast10: s.a10,
  };
}

const bandOf = (value: number): 0 | 1 | 2 | 3 =>
  value < VALUE_BANDS[0] ? 0 : value < VALUE_BANDS[1] ? 1 : value < VALUE_BANDS[2] ? 2 : 3;

function removalOf(games: readonly TableGame[], agent: number, seats: number): RemovalStats {
  const bands: [number, number, number, number] = [0, 0, 0, 0];
  const shares: number[] = [];
  let casts = 0;
  let tokens = 0;
  let atAttacker = 0;
  let atAttackerOfMine = 0;
  for (const g of games) {
    for (const e of g.events ?? []) {
      if (e.kind !== 'removal' || e.target === null || agentAt(g, e.seat, seats) !== agent) {
        continue;
      }
      casts += 1;
      if (e.targetToken) tokens += 1;
      bands[bandOf(e.targetValue)] += 1;
      if (e.bestValue > 0) shares.push(e.targetValue / e.bestValue);
      if (e.attackingSeat !== null) atAttacker += 1;
      if (e.attackingSeat === e.seat) atAttackerOfMine += 1;
    }
  }
  return { casts, tokens, bands, meanShareOfBest: mean(shares), atAttacker, atAttackerOfMine };
}

/** Wins and mean place of each slot, where `slotOf(game, seat)` says which slot a seat falls in (null: leave the game out). */
function slotsOf(
  games: readonly TableGame[],
  seats: number,
  slotOf: (game: TableGame, seat: number) => number | null,
): PositionStats[] {
  const stat = Array.from({ length: seats }, () => ({ games: 0, wins: 0, places: 0 }));
  for (const g of games) {
    for (let seat = 0; seat < seats; seat += 1) {
      const slot = slotOf(g, seat);
      const row = slot === null ? undefined : stat[slot];
      if (row === undefined) continue;
      const place = g.places[seat] ?? 1;
      row.games += 1;
      row.places += place;
      if (g.winnerSeat === seat) row.wins += 1;
    }
  }
  return stat.map((r) => ({
    games: r.games,
    wins: r.wins,
    meanPlace: r.games === 0 ? 0 : r.places / r.games,
  }));
}

/** The report of a run made with `trace: true`; a run without events reports empty attack, block and removal blocks. */
export function tableReport(result: TableResult): TableReport {
  const games = result.log;
  return {
    seats: result.seats,
    games: games.length,
    agents: result.labels.map((label, agent) => ({
      label,
      wins: result.wins[agent] ?? 0,
      survival: survivalOf(games, agent, result.seats),
      attack: attackOf(games, agent, result.seats),
      block: blockOf(games, agent, result.seats),
      removal: removalOf(games, agent, result.seats),
    })),
    bySeat: slotsOf(games, result.seats, (_, seat) => seat),
    byPosition: slotsOf(games, result.seats, (g, seat) =>
      g.startingSeat === null ? null : (seat - g.startingSeat + result.seats) % result.seats,
    ),
  };
}

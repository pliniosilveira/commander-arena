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

export interface TableReport {
  readonly seats: number;
  readonly games: number;
  readonly agents: readonly AgentReport[];
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
  const power: number[] = [];
  for (const g of games) {
    const events = g.events ?? [];
    for (const e of events) {
      if (e.kind !== 'attack' || e.attackers === 0 || agentAt(g, e.seat, seats) !== agent) continue;
      attacks += 1;
      power.push(e.power);
      if (!e.allIn) continue;
      allIn += 1;
      const out = events.find((x) => x.kind === 'eliminated' && x.seat === e.seat);
      if (out !== undefined && out.turn >= e.turn && out.turn - e.turn <= seats) allInThenOut += 1;
    }
  }
  return { attacks, allIn, meanPower: mean(power), allInThenOut };
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
  };
}

// The report of `pnpm ai:arena`: one match result as plain text. Pure, so a test can pin it.

import type {
  MatchResult,
  PlanWork,
  SearchWork,
  TableReport,
  TableResult,
} from '@commander-arena/ai';

const pct = (n: number, of: number): string => (of === 0 ? '-' : `${((100 * n) / of).toFixed(1)}%`);

const row = (cells: readonly (string | number)[], widths: readonly number[]): string =>
  cells
    .map((c, i) => String(c).padEnd(widths[i] ?? 0))
    .join('  ')
    .trimEnd();

/** The reasons of one agent as `reason n` pairs, most frequent first (ties by name). */
function reasonLine(counts: Readonly<Record<string, number | undefined>>): string {
  const entries = Object.entries(counts)
    .filter((e): e is [string, number] => e[1] !== undefined)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  return entries.length === 0
    ? '(none: the agent does not explain itself)'
    : entries.map(([r, n]) => `${r} ${n}`).join(', ');
}

export function formatMatch(r: MatchResult, context: { seed: number; command: string }): string {
  const w = [12, 16, 10, 10];
  const lines = [
    `${r.a} (a) vs ${r.b} (b): ${r.games} games, ${r.games / 2} seeds from ${context.seed}, each played twice with the seats swapped`,
    `command: ${context.command}`,
    '',
    row(['agent', 'wins', 'as seat 0', 'as seat 1'], w),
    row(
      [
        `a ${r.a}`,
        `${r.wins.a} (${pct(r.wins.a, r.games)})`,
        r.winsByAgentSeat.a[0],
        r.winsByAgentSeat.a[1],
      ],
      w,
    ),
    row(
      [
        `b ${r.b}`,
        `${r.wins.b} (${pct(r.wins.b, r.games)})`,
        r.winsByAgentSeat.b[0],
        r.winsByAgentSeat.b[1],
      ],
      w,
    ),
    '',
    `wins by seat: seat 0 ${r.winsBySeat[0]}, seat 1 ${r.winsBySeat[1]}`,
    `draws: ${r.draws}, unfinished (cap or stuck): ${r.unfinished}`,
    `average turns: ${r.averageTurns.toFixed(1)}`,
    `fallbacks: ${r.fallbacks}, rejected actions: ${r.rejectedActions}`,
    `reasons a: ${reasonLine(r.reasons.a)}`,
    `reasons b: ${reasonLine(r.reasons.b)}`,
  ];
  return lines.join('\n');
}

/** What the timing wrapper measured for one agent: the decisions it answered and how long they took. */
export interface DecisionTimes {
  readonly label: string;
  readonly decisions: number;
  readonly totalMs: number;
  readonly slowestMs: number;
  /** Decisions that took longer than the budget, when the caller counted them. */
  readonly overBudget?: number;
  /** The 95th percentile of the decision times, when the caller kept them. */
  readonly p95Ms?: number;
}

/** The decision-time lines of a report: the mean and the slowest decision of each agent. */
export function formatTimes(times: readonly DecisionTimes[], budgetMs: number): string {
  const lines = times.map((t) => {
    const mean = t.decisions === 0 ? 0 : t.totalMs / t.decisions;
    return `decision time ${t.label}: ${t.decisions} decisions, mean ${mean.toFixed(2)} ms, ${t.p95Ms === undefined ? '' : `95th percentile ${t.p95Ms.toFixed(1)} ms, `}slowest ${t.slowestMs.toFixed(1)} ms (budget ${budgetMs} ms${t.overBudget === undefined ? '' : `, ${t.overBudget} over it`})`;
  });
  return lines.join('\n');
}

/**
 * The plannings of one agent's turn planner (issue 653): how many it ran, how many ended in a plan, the share
 * the decision's clock cut (rather than a bound of the work) and the mean work of one planning, and, when any
 * planning looked a turn further (step 4), how many did and what that cost. Null when the agent has no planner.
 */
export function formatPlanning(label: string, works: readonly PlanWork[]): string | null {
  const n = works.length;
  if (n === 0) return null;
  const count = (keep: (w: PlanWork) => boolean): number => works.filter(keep).length;
  const mean = (of: (w: PlanWork) => number, digits = 1): string =>
    (works.reduce((sum, w) => sum + of(w), 0) / n).toFixed(digits);
  const deep = works.filter((w) => w.deepPlayOuts > 0);
  // A planning that ended in a plan is a `PlanRecord`, which also says whether the deeper values changed its choice.
  const changed = deep.filter((w) => 'deepChanged' in w && w.deepChanged === true).length;
  const deepMean = (of: (w: PlanWork) => number): string =>
    (deep.reduce((sum, w) => sum + of(w), 0) / deep.length).toFixed(1);
  return [
    `planning ${label}: ${n} plannings, ${count((w) => w.planned)} with a plan`,
    `cut by the clock ${pct(
      count((w) => w.cut === 'clock'),
      n,
    )}, by a work bound ${pct(
      count((w) => w.cut === 'work'),
      n,
    )}`,
    `per planning: ${mean((w) => w.views)} views, ${mean((w) => w.applies)} engine actions, ${mean((w) => w.playOuts)} play-outs, ${mean((w) => w.steps)} steps, ${mean((w) => w.ms, 2)} ms`,
    ...(deep.length === 0
      ? []
      : [
          `deepened ${pct(deep.length, n)}: ${deepMean((w) => w.deepPlayOuts)} deep play-outs, ${deepMean((w) => w.deepUnits)} work units each, ${pct(changed, deep.length)} of them changed the choice`,
        ]),
  ].join('; ');
}

/**
 * The searches of one agent's decisions (issue 653): how many decisions searched, the share whose searches the
 * safety clock cut (where play depends on the device: the benchmark's logical clock never cuts) or the work
 * budget cut, and the mean work of one. Null when the agent never searched.
 */
export function formatSearches(label: string, searches: readonly SearchWork[]): string | null {
  const n = searches.length;
  if (n === 0) return null;
  const count = (cut: SearchWork['cut']): number => searches.filter((s) => s.cut === cut).length;
  const mean = (of: (s: SearchWork) => number, digits = 1): string =>
    (searches.reduce((sum, s) => sum + of(s), 0) / n).toFixed(digits);
  return [
    `searches ${label}: ${n} decisions searched`,
    `cut by the clock ${pct(count('clock'), n)}, by the work budget ${pct(count('work'), n)}`,
    `per decision: ${mean((s) => s.calls)} engine calls, ${mean((s) => s.units, 0)} work units, ${mean((s) => s.ms, 2)} ms`,
  ].join('; ');
}

/** The report of a table of three or four seats: each agent once in every seat of every seed (`playTable`). */
export function formatTable(r: TableResult, context: { seed: number; command: string }): string {
  const w = [14, 16, ...r.winsBySeat.map(() => 10)];
  const lines = [
    `${r.labels.join(', ')}: ${r.games} games at ${r.seats} seats, ${r.games / r.seats} seeds from ${context.seed}, each played once for each rotation of the agents`,
    `command: ${context.command}`,
    '',
    row(['agent', 'wins', ...r.winsBySeat.map((_, seat) => `as seat ${seat}`)], w),
    ...r.labels.map((label, k) =>
      row(
        [
          `${k} ${label}`,
          `${r.wins[k] ?? 0} (${pct(r.wins[k] ?? 0, r.games)})`,
          ...(r.winsByAgentSeat[k] ?? []),
        ],
        w,
      ),
    ),
    '',
    `wins by seat: ${r.winsBySeat.map((n, seat) => `seat ${seat} ${n}`).join(', ')}`,
    `draws: ${r.draws}, unfinished (cap or stuck): ${r.unfinished}`,
    `average turns: ${r.averageTurns.toFixed(1)}`,
    `fallbacks: ${r.fallbacks}, rejected actions: ${r.rejectedActions}`,
    ...r.labels.map((label, k) => `reasons ${k} ${label}: ${reasonLine(r.reasons[k] ?? {})}`),
  ];
  return lines.join('\n');
}

const avg = (sum: number, n: number): string => (n === 0 ? '-' : (sum / n).toFixed(1));

/**
 * The measuring report of a table run made with events (`tableReport`): survival, the race, blocks and
 * removal of each agent, in plain text. Counts come with their denominator so a rate can be read off.
 */
export function formatTableReport(r: TableReport): string {
  const slot = (label: string, rows: TableReport['bySeat']): string =>
    `${label}: ${rows
      .map(
        (p, i) =>
          `${i} ${p.wins}/${p.games} (${pct(p.wins, p.games)}) place ${p.meanPlace.toFixed(2)}`,
      )
      .join(' | ')}`;
  const lines: string[] = [
    `table report: ${r.games} games at ${r.seats} seats`,
    slot('by seat number', r.bySeat),
    slot('by turn order (0 took the first turn)', r.byPosition),
    '',
  ];
  for (const a of r.agents) {
    const s = a.survival;
    const t = a.attack;
    const b = a.block;
    const m = a.removal;
    const causes = Object.entries(s.causes)
      .map(([c, n]) => `${c} ${n}`)
      .join(', ');
    lines.push(
      `${a.label}`,
      `  survival: mean place ${s.meanPlace.toFixed(2)} (1 best), wins ${a.wins}, first out ${s.firstOut}, eliminated ${s.eliminated}/${s.games}` +
        `, mean elimination turn ${s.meanEliminationTurn === null ? '-' : s.meanEliminationTurn.toFixed(1)}${causes === '' ? '' : `, by ${causes}`}`,
      `  attacks: ${t.attacks}, all-in ${t.allIn} (${pct(t.allIn, t.attacks)}), mean power ${t.meanPower.toFixed(1)}, all-in then out within a round ${t.allInThenOut}`,
      `  aim: at the lowest-life opponent ${t.atLowest} (${pct(t.atLowest, t.atLowest + t.notLowest)}), at another ${t.notLowest}; ties for the lowest ${t.ties}, of which at the lowest seat number ${t.tiesAtLowestSeat} (${pct(t.tiesAtLowestSeat, t.ties)}); all-in while an opponent's board could deal my life ${t.exposedAllIn}, then out within a round ${t.exposedAllInOut}`,
      `  blocks (declarations facing an attack): ${b.declarations}, no block ${b.noBlocks} (${pct(b.noBlocks, b.declarations)}), lethal unblocked ${b.lethal}` +
        `, damage through ${b.unblocked}, avoidable ${b.avoidable} (${pct(b.avoidable, b.unblocked)}), avoidable >=5 in ${b.avoidableAtLeast5}, >=10 in ${b.avoidableAtLeast10}` +
        `, per declaration ${avg(b.unblocked, b.declarations)} through / ${avg(b.avoidable, b.declarations)} avoidable`,
      `  removal: ${m.casts} aimed at a permanent, tokens ${m.tokens}, by value <2 / 2-4 / 4-6 / 6+: ${m.bands.join(' / ')}` +
        `, mean share of the best target ${m.meanShareOfBest.toFixed(2)}, at an attacker ${m.atAttacker}, at one attacking the caster ${m.atAttackerOfMine}`,
    );
  }
  return lines.join('\n');
}

/** The `p`-th percentile (0 to 1) of `xs`, by rank; 0 when there are none. */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

/**
 * What the human waits for (issue 527): the decisions and their time of a whole run, per turn of the game and per round of turns (one turn of every seat). A turn is the engine's
 * turn counter, summed over the games; the time is the sum of every agent's `decide`, so it is the wait when every seat is an AI.
 */
export function formatRound(totals: {
  decisions: number;
  ms: number;
  turns: number;
  seats: number;
}): string {
  const { decisions, ms, turns, seats } = totals;
  if (turns === 0) return 'per turn: no turns played';
  const rounds = turns / seats;
  return `per turn: ${(decisions / turns).toFixed(1)} decisions, ${(ms / turns).toFixed(1)} ms; per round of ${seats} turns: ${(decisions / rounds).toFixed(1)} decisions, ${(ms / rounds).toFixed(1)} ms`;
}

// The report of `pnpm ai:arena`: one match result as plain text. Pure, so a test can pin it.

import type { MatchResult } from '@commander-arena/ai';

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
}

/** The decision-time lines of a report: the mean and the slowest decision of each agent. */
export function formatTimes(times: readonly DecisionTimes[], budgetMs: number): string {
  const lines = times.map((t) => {
    const mean = t.decisions === 0 ? 0 : t.totalMs / t.decisions;
    return `decision time ${t.label}: ${t.decisions} decisions, mean ${mean.toFixed(2)} ms, slowest ${t.slowestMs.toFixed(1)} ms (budget ${budgetMs} ms${t.overBudget === undefined ? '' : `, ${t.overBudget} over it`})`;
  });
  return lines.join('\n');
}

// reports/coverage-baseline.json and the non-regression check (SPEC 7.3: CI fails if coverage
// drops).
//
// The baseline stores supported COUNTS with the population sizes. The check fails when a fresh
// count is below the baseline count. Counts, not percentages, are compared on purpose: a newer
// bulk file adds cards, which lowers a percentage without any regression, while a card that
// stops parsing always lowers a count. Refresh the baseline (`--update-baseline`) when the bulk
// file changes.
//
// The top-500 and top-1,000 populations are picked by EDHREC rank, and ranks change from one bulk
// file to the next, so on a different bulk file those two counts can drop without any parser
// regression. The check therefore fails on them only when the run reads the same bulk file (same
// `source`) as the baseline; on a different file only `all` fails, and a drop in the top lists is
// a warning that asks for a baseline refresh.

import { readFile } from 'node:fs/promises';
import { type CoverageStats, percent, type Share } from './types.ts';

export const BASELINE_VERSION = 1;
export const GROUPS = ['all', 'top500', 'top1000'] as const;
export type Group = (typeof GROUPS)[number];

export interface Baseline {
  readonly version: number;
  readonly scope: 'commander-legal' | 'all-cards';
  readonly source: string;
  readonly parserVersion: number;
  readonly all: Share;
  readonly top500: Share;
  readonly top1000: Share;
}

export function makeBaseline(
  stats: CoverageStats,
  meta: { scope: Baseline['scope']; source: string; parserVersion: number },
): Baseline {
  return {
    version: BASELINE_VERSION,
    scope: meta.scope,
    source: meta.source,
    parserVersion: meta.parserVersion,
    all: stats.all,
    top500: stats.top500,
    top1000: stats.top1000,
  };
}

export function renderBaseline(baseline: Baseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

function isShare(value: unknown): value is Share {
  if (typeof value !== 'object' || value === null) return false;
  const { supported, total } = value as Record<string, unknown>;
  return Number.isInteger(supported) && Number.isInteger(total);
}

/** The baseline at `file`, or an Error that says what is wrong (missing, unreadable, malformed). */
export async function readBaseline(file: string): Promise<Baseline | Error> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return new Error(`no baseline at ${file}; create it with --update-baseline`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return new Error(`the baseline ${file} is not valid JSON`);
  }
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const scope = record.scope;
  if (
    record.version !== BASELINE_VERSION ||
    (scope !== 'commander-legal' && scope !== 'all-cards') ||
    !isShare(record.all) ||
    !isShare(record.top500) ||
    !isShare(record.top1000)
  ) {
    return new Error(
      `the baseline ${file} does not have the expected shape (version ${BASELINE_VERSION})`,
    );
  }
  return {
    version: BASELINE_VERSION,
    scope,
    source: typeof record.source === 'string' ? record.source : '',
    parserVersion: typeof record.parserVersion === 'number' ? record.parserVersion : 0,
    all: record.all,
    top500: record.top500,
    top1000: record.top1000,
  };
}

export interface CheckResult {
  readonly ok: boolean;
  readonly lines: readonly string[];
}

const LABELS: Readonly<Record<Group, string>> = {
  all: 'all cards',
  top500: 'top 500',
  top1000: 'top 1,000',
};

/**
 * Compares fresh numbers with the baseline. With the same bulk file (`source` equal to the
 * baseline's) a lower supported count in any group fails. With a different bulk file only `all`
 * can fail: the top lists are chosen by EDHREC rank, which changes between files, so a drop there
 * is a warning to refresh the baseline.
 */
export function checkAgainstBaseline(
  stats: CoverageStats,
  scope: Baseline['scope'],
  baseline: Baseline,
  source: string,
): CheckResult {
  if (scope !== baseline.scope) {
    return {
      ok: false,
      lines: [
        `The baseline covers "${baseline.scope}" but this run covers "${scope}"; ` +
          'run again with the same options, or refresh it with --update-baseline.',
      ],
    };
  }
  const sameFile = source === baseline.source;
  let ok = true;
  const lines: string[] = [];
  const warnings: string[] = [];
  for (const group of GROUPS) {
    const fresh = stats[group];
    const base = baseline[group];
    const dropped = fresh.supported < base.supported;
    const failing = dropped && (sameFile || group === 'all');
    if (failing) ok = false;
    const mark = failing ? 'DROPPED' : dropped ? 'WARNING' : 'ok     ';
    lines.push(
      `${mark} ${LABELS[group]}: ${fresh.supported}/${fresh.total} ` +
        `(${percent(fresh)}) supported; baseline ${base.supported}/${base.total} (${percent(base)})`,
    );
    if (dropped && !failing) warnings.push(LABELS[group]);
  }
  if (warnings.length > 0) {
    lines.push(
      `Warning: ${warnings.join(' and ')} dropped, but this run read "${source}" and the baseline ` +
        `was made from "${baseline.source}". The top lists are chosen by EDHREC rank, which ` +
        'changes between bulk files, so this is not counted as a regression. Refresh the ' +
        'baseline with --update-baseline.',
    );
  }
  return { ok, lines };
}

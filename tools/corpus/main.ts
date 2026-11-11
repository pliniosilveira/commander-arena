// The commands behind `pnpm corpus:templates`, `pnpm coverage:cards`, `pnpm corpus:replay` and
// `pnpm corpus:decks`.
// Run through cli.ts: this module imports the card pipeline, which needs the resolution hooks.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFile } from './analyze.ts';
import { type Options, parseOptions, USAGE } from './args.ts';
import { buildBacklog } from './backlog.ts';
import { checkAgainstBaseline, makeBaseline, readBaseline, renderBaseline } from './baseline.ts';
import { coverageStats, reasonBreakdown, stopPositions } from './coverage.ts';
import { downloadOracleCards } from './download.ts';
import { extract } from './extract.ts';
import { fromIssue } from './from-issue.ts';
import { DEFAULT_JSON_TEMPLATES, renderBacklog, renderTemplatesJson } from './render-backlog.ts';
import { renderCoverage } from './render-coverage.ts';
import { renderReplay } from './render-replay.ts';
import { parseTemplatesFile, replayTemplates } from './replay.ts';
import { runDecks } from './run-decks.ts';
import { percent } from './types.ts';

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

export interface Deps {
  /** The repository root: where reports/ and .cache/ live by default. */
  readonly repoRoot: string;
  /** Replaces the global fetch (tests only; the sandbox cannot reach Scryfall). */
  readonly fetch?: typeof fetch;
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function write(dir: string, name: string, text: string, io: Io): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await writeFile(file, text);
  const relative = path.relative(process.cwd(), file);
  io.out(`wrote ${relative.startsWith('..') ? file : relative}`);
}

async function inputFile(options: Options, deps: Deps, io: Io): Promise<string> {
  if (options.file !== undefined) return path.resolve(options.file);
  return downloadOracleCards({
    cacheDir: path.resolve(options.cacheDir ?? path.join(deps.repoRoot, '.cache/corpus')),
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    log: (message) => io.out(message),
  });
}

/** `replay`: templates.json through the current parser, to reports/template-replay.md. */
async function replay(options: Options, deps: Deps, io: Io): Promise<number> {
  const file = path.resolve(options.file ?? path.join(deps.repoRoot, 'reports/templates.json'));
  const target = path.resolve(
    options.out ?? path.join(deps.repoRoot, 'reports/template-replay.md'),
  );
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    io.err(`error: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const templates = parseTemplatesFile(text);
  if (typeof templates === 'string') {
    io.err(`error: ${file} is not a templates file: ${templates}`);
    return 2;
  }
  const result = replayTemplates(templates);
  await write(path.dirname(target), path.basename(target), renderReplay(result), io);
  const counts = new Map<string, number>();
  for (const row of result.rows)
    counts.set(row.outcome.kind, (counts.get(row.outcome.kind) ?? 0) + 1);
  io.out(
    `Replayed ${result.rows.length} templates with parser version ${result.currentVersion}: ` +
      `${[...counts].map(([kind, n]) => `${n} ${kind}`).join(', ')}.`,
  );
  return 0;
}

/** Runs one command and returns the process exit code: 0 ok, 1 coverage dropped, 2 bad input. */
export async function run(argv: readonly string[], io: Io, deps: Deps): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    io.out(USAGE);
    return 0;
  }
  const options = parseOptions(argv);
  if (typeof options === 'string') {
    io.err(`error: ${options}\n\n${USAGE}`);
    return 2;
  }
  if (options.command === 'extract') return extract(options, deps.repoRoot, io);
  if (options.command === 'from-issue') return fromIssue(options, deps.repoRoot, io);
  if (options.command === 'replay') return replay(options, deps, io);
  if (options.command === 'decks') return runDecks(options, deps.repoRoot, io);
  const outDir = path.resolve(options.out ?? path.join(deps.repoRoot, 'reports'));
  const baselineFile = path.resolve(
    options.baseline ?? path.join(outDir, 'coverage-baseline.json'),
  );

  let file: string;
  try {
    file = await inputFile(options, deps, io);
  } catch (error) {
    io.err(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  io.out(`Reading ${file} ...`);
  let result: Awaited<ReturnType<typeof analyzeFile>>;
  try {
    result = await analyzeFile(file, { all: options.all });
  } catch (error) {
    io.err(`error: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  io.out(
    `${result.cards.length} cards analysed, ${result.unsupported.length} unsupported` +
      `; ${result.malformed} malformed line(s) skipped, ${result.rejected} rejected` +
      `, ${result.notLegal} not Commander-legal.`,
  );
  if (result.cards.length === 0) {
    io.err('error: no card could be analysed; is this the oracle_cards bulk file?');
    return 2;
  }

  const stats = coverageStats(result.cards);
  const scope = options.all ? 'all-cards' : 'commander-legal';
  if (options.check) {
    const baseline = await readBaseline(baselineFile);
    if (baseline instanceof Error) {
      io.err(`error: ${baseline.message}`);
      return 2;
    }
    const verdict = checkAgainstBaseline(stats, scope, baseline, result.source);
    for (const line of verdict.lines) io.out(line);
    io.out(verdict.ok ? 'Coverage did not drop.' : 'Coverage dropped below the baseline.');
    return verdict.ok ? 0 : 1;
  }

  const backlog = buildBacklog(result.unsupported, result.cards);
  await write(outDir, 'backlog.md', renderBacklog(result, backlog), io);
  await write(
    outDir,
    'templates.json',
    renderTemplatesJson(result, backlog, options.maxTemplates ?? DEFAULT_JSON_TEMPLATES),
    io,
  );
  if (options.command === 'coverage') {
    const reasons = reasonBreakdown(result.unsupported);
    const stops = stopPositions(result.unsupported);
    await write(outDir, 'coverage.md', renderCoverage(result, stats, reasons, stops, backlog), io);
    io.out(
      `Supported: ${percent(stats.all)} of all, ${percent(stats.top500)} of the top 500, ` +
        `${percent(stats.top1000)} of the top 1,000.`,
    );
    if (options.updateBaseline) {
      const baseline = makeBaseline(stats, {
        scope,
        source: result.source,
        parserVersion: result.parserVersion,
      });
      await write(
        path.dirname(baselineFile),
        path.basename(baselineFile),
        renderBaseline(baseline),
        io,
      );
    }
  }
  return 0;
}

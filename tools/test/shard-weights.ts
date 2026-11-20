// Writes `shard-weights.json`: how many seconds each test file of the PR tier takes, read from the Vitest logs of CI runs, so that `shard-sequencer.ts` can split the files into shards
// of about equal time (`shard-plan.ts`).
//
//   node tools/test/shard-weights.ts --out tools/test/shard-weights.json --source "<what the logs are>" <vitest.log> [<vitest.log> ...]
//
// The logs are the `vitest.log` of the `pr-test-results-*` artifacts of a green run of the CI workflow (one per shard; pass all four), or the job logs of the same run saved with
// `gh run view --log`. Several runs can be given: a file's weight is the mean of the runs, which smooths the noise of the runners (the same file took 133 s in one run and 202 s in
// another). Vitest's default reporter prints a duration only for a file slower than its slow-test threshold (300 ms); a file without one is a light file and takes the default weight.
// Only the files of at least `MIN_SECONDS` are written: the rest take the default, and the file stays short and stable. Run it again when the PR tier changes much (a heavy suite is
// added, split or cut); a stale weight only costs balance, never correctness.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** What a file that is not in the weights takes: most files are light, and a new file is most likely one of them. */
export const DEFAULT_SECONDS = 0.3;
/** The files lighter than this are not written down: they take the default. */
export const MIN_SECONDS = 1;

// The colour codes: the escape byte in a log file, or written as the two characters "^[" in the text of `gh run view --log`.
const ANSI = new RegExp(`(?:${String.fromCharCode(27)}|\\^\\[)\\[[0-9;]*m`, 'g');
// "✓ @commander-arena/ai test/hidden-info.test.ts (12 tests) 201896ms", with or without the colours and the `|project|` bars of the plain reporter.
const FILE_LINE =
  /[✓❯×↓]\s+\|?(@commander-arena\/[^\s|]+)\|?\s+(\S+\.test\.tsx?)\s+\(\d+ tests?[^)]*\)(?:\D*?(\d+)ms)?/;

/** One file of a log: its project name, its path from the project root and its seconds (null when the log gave none, a light file). */
export interface LoggedFile {
  readonly project: string;
  readonly path: string;
  readonly seconds: number | null;
}

/** The files a Vitest log names, once each (a file a retry prints twice counts with its last line). */
export function parseVitestLog(text: string): LoggedFile[] {
  const byKey = new Map<string, LoggedFile>();
  for (const raw of text.split('\n')) {
    const match = FILE_LINE.exec(raw.replace(ANSI, ''));
    if (match === null) continue;
    const [, project, path, ms] = match;
    if (project === undefined || path === undefined) continue;
    byKey.set(`${project} ${path}`, {
      project,
      path,
      seconds: ms === undefined ? null : Number(ms) / 1000,
    });
  }
  return [...byKey.values()];
}

/** The directory of each workspace project from its package name, read from the `package.json` files under `root`. */
export function projectDirectories(root: string): Map<string, string> {
  const dirs = new Map<string, string>();
  const add = (dir: string) => {
    try {
      const pkg = JSON.parse(readFileSync(resolve(root, dir, 'package.json'), 'utf8')) as {
        name?: string;
      };
      if (pkg.name !== undefined) dirs.set(pkg.name, dir);
    } catch {
      // A folder without a package.json is not a project.
    }
  };
  for (const parent of ['packages', 'apps']) {
    for (const entry of readdirSync(resolve(root, parent), { withFileTypes: true })) {
      if (entry.isDirectory()) add(`${parent}/${entry.name}`);
    }
  }
  add('tools');
  return dirs;
}

/** The weights of several runs: the mean seconds of each file over the runs, written for the files of at least `MIN_SECONDS`, by repository path. */
export function weightsOf(
  runs: readonly (readonly LoggedFile[])[],
  dirs: ReadonlyMap<string, string>,
): Record<string, number> {
  const samples = new Map<string, number[]>();
  for (const run of runs) {
    for (const file of run) {
      const dir = dirs.get(file.project);
      if (dir === undefined)
        throw new Error(`The log names a project that is not in the workspace: ${file.project}`);
      const id = `${dir}/${file.path}`;
      const list = samples.get(id) ?? [];
      list.push(file.seconds ?? DEFAULT_SECONDS);
      samples.set(id, list);
    }
  }
  const out: Record<string, number> = {};
  for (const id of [...samples.keys()].sort()) {
    const list = samples.get(id) ?? [];
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    if (mean >= MIN_SECONDS) out[id] = Math.round(mean * 10) / 10;
  }
  return out;
}

const USAGE =
  'Usage: node tools/test/shard-weights.ts --out <file> [--source <text>] <vitest.log> [<vitest.log> ...]';

function main(argv: readonly string[]): void {
  if (argv.includes('--help')) {
    console.log(USAGE);
    return;
  }
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  let out: string | undefined;
  let source: string | undefined;
  const logs: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') out = argv[++i];
    else if (arg === '--source') source = argv[++i];
    else if (arg !== undefined) logs.push(arg);
  }
  if (out === undefined || logs.length === 0) throw new Error(USAGE);
  const runs = logs.map((log) => parseVitestLog(readFileSync(log, 'utf8')));
  for (const [i, run] of runs.entries()) {
    if (run.length === 0) throw new Error(`No test file lines in ${logs[i]}: is it a Vitest log?`);
  }
  const weights = weightsOf(runs, projectDirectories(root));
  const document = {
    source: source ?? `Vitest logs: ${logs.map((log) => basename(log)).join(', ')}`,
    defaultSeconds: DEFAULT_SECONDS,
    weights,
  };
  writeFileSync(resolve(out), `${JSON.stringify(document, null, 2)}\n`);
  const seconds = Object.values(weights).reduce((a, b) => a + b, 0);
  console.log(
    `${Object.keys(weights).length} files of at least ${MIN_SECONDS} s (${seconds.toFixed(0)} s in all) written to ${relative(process.cwd(), resolve(out))}`,
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

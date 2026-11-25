// Extracts the AI agents of another commit for the benchmark (issue 624, phase 1):
//
//   node tools/ai/baseline.ts --ref main [--out tools/ai/.baseline]
//
// writes the files of `packages/ai/src` at `--ref` into `--out` (git ignores the default folder), plus a
// `REF` file with the commit. `node tools/ai/benchmark.ts --baseline <out>` then plays the agent of the
// working tree against that one. The baseline is the agent code of the other commit played on the
// engine of the working tree: its imports of `@commander-arena/engine` resolve to this checkout, so both
// agents play the same rules and a difference in the result is a difference of the agents. A baseline
// whose agent code does not compile against today's engine API fails to load; extract a newer one.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_BASELINE_FOLDER } from './baseline-folder.ts';

const { values } = parseArgs({
  options: {
    ref: { type: 'string', default: 'main' },
    out: { type: 'string', default: DEFAULT_BASELINE_FOLDER },
  },
});

const out = resolve(values.out);
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const commit = execFileSync('git', ['rev-parse', '--verify', `${values.ref}^{commit}`], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const archive = execFileSync('git', ['archive', '--format=tar', commit, 'packages/ai/src'], {
  cwd: root,
  maxBuffer: 256 * 1024 * 1024,
});
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });
execFileSync('tar', ['-x', '-C', out, '--strip-components=3'], { input: archive });
writeFileSync(join(out, 'REF'), `${values.ref} ${commit}\n`);
process.stdout.write(`baseline: packages/ai/src of ${values.ref} (${commit}) in ${out}\n`);

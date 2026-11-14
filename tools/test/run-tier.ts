import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [tier, ...input] = process.argv.slice(2);
const paths = input[0] === '--' ? input.slice(1) : input;

if (tier !== 'pr' && tier !== 'focused') {
  throw new Error('Choose the pr or focused test tier.');
}

if (tier === 'focused' && paths.length === 0) {
  throw new Error('Pass one or more test paths to the focused test tier.');
}

const vitest = fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url));
const args = ['run', ...paths];

if (tier === 'pr') {
  // Exact paths only: new tests remain in the PR tier unless deliberately added to this manifest.
  const excluded = JSON.parse(
    readFileSync(new URL('./pr-excluded.json', import.meta.url), 'utf8'),
  ) as string[];
  for (const name of excluded) {
    const path = `packages/ai/test/${name}`;
    if (!existsSync(resolve(path)))
      throw new Error(`PR-excluded test file does not exist: ${path}`);
    args.push('--exclude', path);
  }
}

if (process.env.VITEST_RESULTS_DIR !== undefined) {
  mkdirSync(process.env.VITEST_RESULTS_DIR, { recursive: true });
  args.push(
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${process.env.VITEST_RESULTS_DIR}/vitest-results.json`,
  );
}

const result = spawnSync(process.execPath, [vitest, ...args], {
  stdio: 'inherit',
  env: { ...process.env, TEST_TIER: tier },
});

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;

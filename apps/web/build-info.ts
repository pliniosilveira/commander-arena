/**
 * The build identifier the page shows on the start screen (D-215): the short git commit hash and
 * the date of that commit, read once when Vite starts and injected as constants (`define`), so a
 * build of one commit is the same build every time (no clock is read). Where there is no git
 * checkout (a source archive, a build container without `.git`) the hash comes from the CI's own
 * variable when it names one, and is `dev` otherwise.
 */
import { execFileSync } from 'node:child_process';

export interface BuildInfo {
  /** The short commit hash, or `dev`. */
  readonly commit: string;
  /** The commit date as `YYYY-MM-DD`, or an empty string when unknown. */
  readonly date: string;
}

const SHORT_HASH_LENGTH = 7;

function git(args: readonly string[]): string | null {
  try {
    const out = execFileSync('git', [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === '' ? null : out;
  } catch {
    return null;
  }
}

/** The commit a CI names in its environment: Cloudflare (Workers builds, Pages) or GitHub Actions. */
function ciCommit(env: Readonly<Record<string, string | undefined>>): string | null {
  for (const key of ['WORKERS_CI_COMMIT_SHA', 'CF_PAGES_COMMIT_SHA', 'GITHUB_SHA']) {
    const value = env[key]?.trim();
    if (value !== undefined && /^[0-9a-f]{7,40}$/i.test(value)) return value;
  }
  return null;
}

/** `run` is the git lookup (a seam for the tests): its output, or null when git is missing or fails. */
export function readBuildInfo(
  env: Readonly<Record<string, string | undefined>>,
  run: (args: readonly string[]) => string | null = git,
): BuildInfo {
  const hash = run(['rev-parse', `--short=${SHORT_HASH_LENGTH}`, 'HEAD']);
  const fromEnv = ciCommit(env);
  const commit = hash ?? (fromEnv === null ? 'dev' : fromEnv.slice(0, SHORT_HASH_LENGTH));
  const date = hash === null ? null : run(['log', '-1', '--format=%cs', 'HEAD']);
  return { commit: commit.toLowerCase(), date: date ?? '' };
}

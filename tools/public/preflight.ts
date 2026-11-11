// `node tools/public/preflight.ts [--root <dir>]`: what must not be in the tree of a repository that is about to be made public (D-248).
// It reads the tracked files of a git checkout (`git ls-files`) and reports: Wizards' text that D-246 keeps out, things that look like
// secrets, e-mail addresses, links to private Claude sessions and mentions of an employer's name (given in PREFLIGHT_EMPLOYER). It reads the tree only, not the
// history: the public repository starts from a single commit (docs/GO_PUBLIC.md). Exit 0 when nothing is found, 1 otherwise.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Finding {
  readonly check: string;
  readonly file: string;
  readonly detail: string;
}

/** Wizards' text that D-246 keeps out of the repository. */
const WIZARDS_PATHS: readonly RegExp[] = [
  /^docs\/rules\/comprehensive-rules\.txt$/,
  /^docs\/rules\/bulletins\//,
  /(^|\/)MagicCompRules[^/]*$/i,
];

const SECRETS =
  /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|\bsk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[bp]-[A-Za-z0-9-]{10,}|-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----)/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** Addresses that are fine in a public repository. */
const EMAIL_OK =
  /(@users\.noreply\.github\.com|^noreply@anthropic\.com|@example\.(com|org|invalid)|\.invalid|^git@github\.com)$/i;
const SESSION_LINK = /claude\.ai\/code\/session_[A-Za-z0-9]+/;
/**
 * An employer's name to look for, given in `PREFLIGHT_EMPLOYER` (case does not matter). It is not written in this file, which would publish it;
 * without the variable the check is off.
 */
function employerPattern(): RegExp | null {
  const name = process.env.PREFLIGHT_EMPLOYER?.trim() ?? '';
  return name === '' ? null : new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/** This tool and its test hold the patterns they look for (and SYNTHETIC examples of each), so their content is not scanned. */
const SELF = /^tools\/public\//;

/** Files whose text is data, not ours to scan line by line for e-mail addresses (lockfile, card data). */
const SKIP_CONTENT = /(^|\/)pnpm-lock\.yaml$|\.(png|jpe?g|webp|gif|ico|woff2?|ttf|pdf|gz)$/i;
const MAX_BYTES = 3_000_000;

function trackedFiles(root: string): string[] {
  return execFileSync('git', ['-C', root, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  })
    .split('\0')
    .filter((f) => f !== '');
}

/** The findings for the tracked files of the checkout at `root`. */
export function preflight(root: string): Finding[] {
  const findings: Finding[] = [];
  const employer = employerPattern();
  for (const file of trackedFiles(root)) {
    if (WIZARDS_PATHS.some((re) => re.test(file))) {
      findings.push({ check: 'wizards-text', file, detail: "Wizards' text is tracked (D-246)" });
    }
    if (SKIP_CONTENT.test(file) || SELF.test(file)) continue;
    const abs = path.join(root, file);
    let text: string;
    try {
      if (statSync(abs).size > MAX_BYTES) continue;
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    const secret = SECRETS.exec(text);
    if (secret !== null) {
      findings.push({
        check: 'secret',
        file,
        detail: `looks like a secret: ${secret[0].slice(0, 12)}...`,
      });
    }
    for (const mail of new Set(text.match(EMAIL) ?? [])) {
      if (!EMAIL_OK.test(mail)) findings.push({ check: 'email', file, detail: mail });
    }
    if (SESSION_LINK.test(text)) {
      findings.push({ check: 'session-link', file, detail: 'a link to a private Claude session' });
    }
    if (employer?.test(text)) {
      findings.push({ check: 'employer', file, detail: "mentions the owner's employer" });
    }
  }
  return findings;
}

function main(): number {
  const at = process.argv.indexOf('--root');
  const root = path.resolve(at >= 0 ? (process.argv[at + 1] ?? '.') : '.');
  const findings = preflight(root);
  if (findings.length === 0) {
    process.stdout.write(`preflight: nothing found in the tracked files of ${root}\n`);
    return 0;
  }
  for (const f of findings) process.stdout.write(`${f.check.padEnd(13)} ${f.file}: ${f.detail}\n`);
  process.stdout.write(`\npreflight: ${findings.length} finding(s) in ${root}\n`);
  return 1;
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  process.exitCode = main();
}

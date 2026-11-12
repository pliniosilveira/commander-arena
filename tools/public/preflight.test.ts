// The public-repository preflight on throwaway git repositories: SYNTHETIC content only, nothing here is a real secret or address.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { preflight } from './preflight.ts';

function repo(files: Record<string, string>): string {
  const dir = path.join(
    tmpdir(),
    `preflight-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
  git('init', '-q');
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  git('add', '-A');
  return dir;
}

const checks = (files: Record<string, string>) => preflight(repo(files)).map((f) => f.check);

afterEach(() => vi.unstubAllEnvs());

describe('the go-public preflight', () => {
  test('a clean tree has no finding, and the allowed addresses are not findings', () => {
    expect(
      checks({
        'README.md':
          'Contact: 2287889+someone@users.noreply.github.com, Co-Authored-By noreply@anthropic.com, a@example.com',
        'a.ts': 'export const x = 1;',
      }),
    ).toEqual([]);
  });

  test("Wizards' text that D-246 keeps out is a finding, by path", () => {
    const found = preflight(
      repo({
        'docs/rules/comprehensive-rules.txt': 'synthetic',
        'docs/rules/bulletins/x.md': 'synthetic',
        'docs/rules/README.md': 'fine',
      }),
    );
    expect(found.map((f) => f.file).sort()).toEqual([
      'docs/rules/bulletins/x.md',
      'docs/rules/comprehensive-rules.txt',
    ]);
    expect(found.every((f) => f.check === 'wizards-text')).toBe(true);
  });

  test('a secret-looking string, an e-mail address, a session link and the employer are findings', () => {
    expect(checks({ 'a.txt': `token ghp_${'a'.repeat(24)}` })).toEqual(['secret']);
    expect(checks({ 'a.txt': 'write to someone@somewhere-else.org' })).toEqual(['email']);
    expect(checks({ 'a.txt': 'see https://claude.ai/code/session_0123456789abcdef' })).toEqual([
      'session-link',
    ]);
    // The employer check is off unless PREFLIGHT_EMPLOYER names one (SYNTHETIC name here).
    expect(checks({ 'a.txt': 'built at Acme Corp' })).toEqual([]);
    vi.stubEnv('PREFLIGHT_EMPLOYER', 'acme corp');
    expect(checks({ 'a.txt': 'built at Acme Corp' })).toEqual(['employer']);
  });

  test("the tool's own folder is not scanned: it holds the patterns it looks for", () => {
    expect(checks({ 'tools/public/preflight.ts': 'Acme Corp someone@somewhere-else.org' })).toEqual(
      [],
    );
  });

  test('the lockfile is not read for addresses', () => {
    expect(checks({ 'pnpm-lock.yaml': 'author: someone@somewhere-else.org' })).toEqual([]);
  });
});

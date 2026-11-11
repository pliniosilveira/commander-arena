// Where the CR text is read from: the repository's own path, or the file `COMMANDER_ARENA_CR_FILE` names (D-246).
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('the CR file path', () => {
  test('is docs/rules/comprehensive-rules.txt unless the environment says otherwise', async () => {
    vi.stubEnv('COMMANDER_ARENA_CR_FILE', '');
    delete process.env.COMMANDER_ARENA_CR_FILE;
    vi.resetModules();
    const { CR_FILE, REPO_ROOT } = await import('./paths.ts');
    expect(CR_FILE).toBe(path.join(REPO_ROOT, 'docs', 'rules', 'comprehensive-rules.txt'));
  });

  test('is the file COMMANDER_ARENA_CR_FILE names, so a copy kept outside the repository can be used', async () => {
    vi.stubEnv('COMMANDER_ARENA_CR_FILE', '/somewhere/else/cr.txt');
    vi.resetModules();
    const { CR_FILE } = await import('./paths.ts');
    expect(CR_FILE).toBe('/somewhere/else/cr.txt');
  });
});

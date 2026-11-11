// Proves the Biome plugin rejects nondeterministic APIs in engine and ai code, and only there.
// The temp project reuses the `overrides` of the real biome.json, so the test fails if the
// scoping in biome.json drifts away from the packages that must be deterministic.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const biomeBin = join(repoRoot, 'node_modules/.bin/biome');

interface Override {
  includes: string[];
  plugins: string[];
}

let project: string;

beforeAll(() => {
  const real = JSON.parse(readFileSync(join(repoRoot, 'biome.json'), 'utf8')) as {
    overrides: Override[];
  };
  const overrides = real.overrides.map((o) => ({
    ...o,
    plugins: o.plugins.map((p) => resolve(repoRoot, p)),
  }));
  project = mkdtempSync(join(tmpdir(), 'nondeterminism-'));
  writeFileSync(
    join(project, 'biome.json'),
    JSON.stringify({
      root: true,
      linter: { enabled: true, rules: { recommended: false } },
      formatter: { enabled: false },
      overrides,
    }),
  );
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

function lint(relPath: string, source: string) {
  const full = join(project, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, source);
  const result = spawnSync(biomeBin, ['lint', relPath], { cwd: project, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
}

const banned: [source: string, label: string, message: string][] = [
  ['export const a = Math.random();\n', 'Math.random()', 'forbidden here'],
  ['export const a = Date.now();\n', 'Date.now()', 'forbidden here'],
  ['export const a = new Date();\n', 'new Date()', 'forbidden here'],
  ['export const a = performance.now();\n', 'performance.now()', 'forbidden here'],
  ["export const a = 'x'.localeCompare('y');\n", 'localeCompare', 'host locale'],
  ['export const a = (1).toLocaleString();\n', 'toLocaleString', 'host locale'],
];

describe('nondeterminism lint', () => {
  for (const pkg of ['engine', 'ai']) {
    for (const [source, label, message] of banned) {
      test(`${pkg}: rejects ${label}`, () => {
        const { ok, output } = lint(`packages/${pkg}/src/x.ts`, source);
        expect(ok).toBe(false);
        expect(output).toContain(message);
      });
    }
  }

  test('engine: accepts deterministic code', () => {
    const { ok, output } = lint(
      'packages/engine/src/clean.ts',
      'export const a = [3, 1, 2].sort((x, y) => x - y);\n',
    );
    expect(output).not.toContain('forbidden here');
    expect(ok).toBe(true);
  });

  test('cards and web: the ban does not apply', () => {
    for (const path of ['packages/cards/src/x.ts', 'apps/web/src/x.ts']) {
      const { ok, output } = lint(path, 'export const a = Date.now() + Math.random();\n');
      expect(output).not.toContain('forbidden here');
      expect(ok).toBe(true);
    }
  });
});

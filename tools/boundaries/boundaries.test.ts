// Proves the package-boundary rules reject forbidden imports (M0 exit criterion).
// Each case builds a tiny monorepo in a temp directory, with workspace packages linked the way
// pnpm links them, runs dependency-cruiser with the real rules, and checks which rules fire.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { cruise, type IForbiddenRuleType } from 'dependency-cruiser';
import { afterAll, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { forbidden } = require('./rules.cjs') as { forbidden: IForbiddenRuleType[] };
const realConfig = require('../../.dependency-cruiser.cjs') as {
  options: { exclude: { path: string } };
};

const PACKAGES = ['engine', 'cards', 'ai'] as const;
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

type Files = Record<string, string>;

function write(root: string, path: string, content: string) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function link(root: string, from: string, to: string) {
  const full = join(root, from);
  mkdirSync(dirname(full), { recursive: true });
  symlinkSync(relative(dirname(full), join(root, to)), full, 'dir');
}

/** Lays out packages/{engine,cards,ai}, apps/web, every package linked to every other. */
function buildRepo(
  files: Files,
  opts: {
    pnpmZod?: boolean;
    flatZod?: boolean;
    react?: boolean;
    comlink?: boolean;
    vitest?: boolean;
  },
) {
  const root = mkdtempSync(join(tmpdir(), 'boundaries-'));
  roots.push(root);
  const dirs = [...PACKAGES.map((p) => `packages/${p}`), 'apps/web'];
  for (const dir of dirs) {
    const name = dir.split('/')[1];
    write(
      root,
      `${dir}/package.json`,
      JSON.stringify({
        name: `@commander-arena/${name}`,
        exports: { '.': './src/index.ts', './testing': './src/testing/index.ts' },
      }),
    );
    write(root, `${dir}/src/index.ts`, 'export {};\n');
    write(root, `${dir}/src/testing/index.ts`, 'export {};\n');
    for (const other of dirs) {
      if (other === dir) continue;
      link(root, `${dir}/node_modules/@commander-arena/${other.split('/')[1]}`, other);
    }
  }
  if (opts.flatZod) {
    write(root, 'node_modules/zod/package.json', '{"name":"zod","main":"index.js"}');
    write(root, 'node_modules/zod/index.js', 'module.exports = {};\n');
    link(root, 'packages/engine/node_modules/zod', 'node_modules/zod');
  }
  if (opts.pnpmZod) {
    const store = 'node_modules/.pnpm/zod@4.6.7/node_modules/zod';
    write(root, `${store}/package.json`, '{"name":"zod","main":"index.js"}');
    write(root, `${store}/index.js`, 'module.exports = {};\n');
    link(root, 'packages/engine/node_modules/zod', store);
  }
  if (opts.react) {
    const store = 'node_modules/.pnpm/react@19.3.1/node_modules/react';
    write(root, `${store}/package.json`, '{"name":"react","main":"index.js"}');
    write(root, `${store}/index.js`, 'module.exports = {};\n');
    link(root, 'packages/engine/node_modules/react', store);
    link(root, 'packages/ai/node_modules/react', store);
  }
  if (opts.vitest) {
    // Test runner with a dist/ entry point, as in the real tree. Tests may import it; src may not.
    const store = 'node_modules/.pnpm/vitest@5.0.5/node_modules/vitest';
    write(root, `${store}/package.json`, '{"name":"vitest","main":"dist/index.js"}');
    write(root, `${store}/dist/index.js`, 'module.exports = {};\n');
    for (const pkg of PACKAGES) link(root, `packages/${pkg}/node_modules/vitest`, store);
  }
  if (opts.comlink) {
    // An npm package whose entry point is under dist/, like comlink. The real config's exclude
    // must not hide it from the allowlist rules.
    const store = 'node_modules/.pnpm/comlink@4.4.2/node_modules/comlink';
    write(root, `${store}/package.json`, '{"name":"comlink","main":"dist/umd/comlink.js"}');
    write(root, `${store}/dist/umd/comlink.js`, 'module.exports = {};\n');
    link(root, 'packages/engine/node_modules/comlink', store);
    link(root, 'packages/ai/node_modules/comlink', store);
  }
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  return root;
}

async function violations(root: string): Promise<string[]> {
  const result = await cruise(
    ['packages', 'apps'],
    {
      baseDir: root,
      validate: true,
      ruleSet: { forbidden },
      doNotFollow: { path: 'node_modules' },
      exclude: realConfig.options.exclude,
      tsPreCompilationDeps: true,
      enhancedResolveOptions: {
        exportsFields: ['exports'],
        conditionNames: ['import', 'require', 'node', 'default', 'types'],
        mainFields: ['module', 'main', 'types'],
      },
    },
    {},
  );
  const output = result.output;
  if (typeof output === 'string') throw new Error('expected object output');
  // Guard against a vacuous pass: a misconfigured cruise that scans nothing reports no violations.
  if (output.modules.filter((m) => m.source.endsWith('.ts')).length === 0) {
    throw new Error(
      'dependency-cruiser scanned no TypeScript files; is a supported TypeScript installed?',
    );
  }
  return output.summary.violations.map((v) => v.rule.name);
}

interface Case {
  name: string;
  /** Rule that must fire. Omit for a case that must be clean. */
  rule?: string;
  files: Files;
  repo?: {
    pnpmZod?: boolean;
    flatZod?: boolean;
    react?: boolean;
    comlink?: boolean;
    vitest?: boolean;
  };
}

const cases: Case[] = [
  {
    name: 'clean: engine imports itself and zod (pnpm layout), ai/cards/web use public APIs',
    repo: { pnpmZod: true },
    files: {
      'packages/engine/src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'packages/engine/src/b.ts': "import 'zod';\nexport const b = 1;\n",
      'packages/ai/src/x.ts': "import '@commander-arena/engine';\nexport const x = 1;\n",
      'packages/cards/src/y.ts': "import '@commander-arena/engine';\nexport const y = 1;\n",
      'apps/web/src/z.ts':
        "import '@commander-arena/engine';\nimport '@commander-arena/cards';\nimport '@commander-arena/ai';\nexport const z = 1;\n",
    },
  },
  {
    name: 'clean: engine imports zod (flat layout)',
    repo: { flatZod: true },
    files: { 'packages/engine/src/a.ts': "import 'zod';\nexport const a = 1;\n" },
  },
  {
    name: 'clean: engine and ai tests may import vitest and Node built-ins',
    repo: { vitest: true },
    files: {
      'packages/engine/test/a.test.ts':
        "import 'vitest';\nimport { readFileSync } from 'node:fs';\nexport const a = readFileSync;\n",
      'packages/ai/test/a.test.ts':
        "import 'vitest';\nimport { join } from 'node:path';\nexport const a = join;\n",
    },
  },
  {
    name: 'engine src importing vitest',
    rule: 'engine-npm-allowlist',
    repo: { vitest: true },
    files: { 'packages/engine/src/a.ts': "import 'vitest';\nexport const a = 1;\n" },
  },
  {
    name: 'engine importing cards',
    rule: 'engine-no-other-packages',
    files: {
      'packages/engine/src/a.ts': "import '@commander-arena/cards';\nexport const a = 1;\n",
    },
  },
  {
    name: 'engine importing the web app',
    rule: 'engine-no-other-packages',
    files: { 'packages/engine/src/a.ts': "import '@commander-arena/web';\nexport const a = 1;\n" },
  },
  {
    name: 'engine importing a Node built-in',
    rule: 'engine-no-node-builtins',
    files: {
      'packages/engine/src/a.ts':
        "import { readFileSync } from 'node:fs';\nexport const a = readFileSync;\n",
    },
  },
  {
    name: 'engine importing react',
    rule: 'engine-npm-allowlist',
    repo: { react: true },
    files: { 'packages/engine/src/a.ts': "import 'react';\nexport const a = 1;\n" },
  },
  {
    name: 'engine importing an npm package with a dist/ entry point',
    rule: 'engine-npm-allowlist',
    repo: { comlink: true },
    files: { 'packages/engine/src/a.ts': "import 'comlink';\nexport const a = 1;\n" },
  },
  {
    name: 'ai importing an npm package with a dist/ entry point',
    rule: 'ai-npm-allowlist',
    repo: { comlink: true },
    files: { 'packages/ai/src/a.ts': "import 'comlink';\nexport const a = 1;\n" },
  },
  {
    name: 'clean: the repo exclude ignores our own dist output',
    files: {
      'packages/engine/dist/junk.ts': "import 'nonexistent-package';\nexport const a = 1;\n",
      'packages/engine/src/a.ts': 'export const a = 1;\n',
    },
  },
  {
    name: 'ai importing cards',
    rule: 'ai-only-engine',
    files: { 'packages/ai/src/a.ts': "import '@commander-arena/cards';\nexport const a = 1;\n" },
  },
  {
    name: 'ai importing the web app',
    rule: 'ai-only-engine',
    files: { 'packages/ai/src/a.ts': "import '@commander-arena/web';\nexport const a = 1;\n" },
  },
  {
    name: 'ai importing a Node built-in',
    rule: 'ai-no-node-builtins',
    files: { 'packages/ai/src/a.ts': "import 'node:path';\nexport const a = 1;\n" },
  },
  {
    name: 'ai importing an npm package',
    rule: 'ai-npm-allowlist',
    repo: { react: true },
    files: { 'packages/ai/src/a.ts': "import 'react';\nexport const a = 1;\n" },
  },
  {
    name: 'cards importing ai',
    rule: 'cards-no-ai-or-web',
    files: { 'packages/cards/src/a.ts': "import '@commander-arena/ai';\nexport const a = 1;\n" },
  },
  {
    name: 'cards importing the web app',
    rule: 'cards-no-ai-or-web',
    files: { 'packages/cards/src/a.ts': "import '@commander-arena/web';\nexport const a = 1;\n" },
  },
  {
    name: 'a library package importing apps/web',
    rule: 'packages-no-apps',
    files: {
      'packages/cards/src/a.ts': "import '../../../apps/web/src/index';\nexport const a = 1;\n",
    },
  },
  {
    name: 'cards reaching into engine internals',
    rule: 'public-api-only-from-packages',
    files: {
      'packages/engine/src/internal.ts': 'export const secret = 1;\n',
      'packages/cards/src/a.ts':
        "import { secret } from '../../engine/src/internal';\nexport const a = secret;\n",
    },
  },
  {
    name: 'ai test reaching into engine internals',
    rule: 'public-api-only-from-packages',
    files: {
      'packages/engine/src/internal.ts': 'export const secret = 1;\n',
      'packages/ai/test/a.test.ts':
        "import { secret } from '../../engine/src/internal';\nexport const a = secret;\n",
    },
  },
  {
    name: 'web reaching into engine internals',
    rule: 'public-api-only-from-web',
    files: {
      'packages/engine/src/internal.ts': 'export const secret = 1;\n',
      'apps/web/src/a.ts':
        "import { secret } from '../../../packages/engine/src/internal';\nexport const a = secret;\n",
    },
  },
  {
    name: 'clean: test code of every package may import the engine testing entry',
    files: {
      'packages/engine/test/a.test.ts': "import '../src/testing/index';\nexport const a = 1;\n",
      'packages/ai/test/a.test.ts':
        "import '@commander-arena/engine/testing';\nexport const a = 1;\n",
      'packages/cards/test/a.test.ts':
        "import '@commander-arena/engine/testing';\nexport const a = 1;\n",
      'apps/web/test/a.test.ts': "import '@commander-arena/engine/testing';\nexport const a = 1;\n",
      'apps/web/e2e/a.e2e.ts': "import '@commander-arena/engine/testing';\nexport const a = 1;\n",
    },
  },
  {
    name: 'web source importing the engine testing entry',
    rule: 'engine-testing-entry-tests-only',
    files: {
      'apps/web/src/a.ts': "import '@commander-arena/engine/testing';\nexport const a = 1;\n",
    },
  },
  {
    name: 'ai source importing the engine testing entry',
    rule: 'engine-testing-entry-tests-only',
    files: {
      'packages/ai/src/a.ts': "import '@commander-arena/engine/testing';\nexport const a = 1;\n",
    },
  },
  {
    name: 'engine source outside testing importing the testing entry',
    rule: 'engine-testing-entry-tests-only',
    files: { 'packages/engine/src/a.ts': "import './testing/index';\nexport const a = 1;\n" },
  },
  {
    name: 'an import cycle inside one package',
    rule: 'no-circular',
    files: {
      'packages/engine/src/a.ts': "import './b';\nexport const a = 1;\n",
      'packages/engine/src/b.ts': "import './a';\nexport const b = 1;\n",
    },
  },
  {
    name: 'an import that does not resolve',
    rule: 'not-to-unresolvable',
    files: { 'packages/engine/src/a.ts': "import './missing';\nexport const a = 1;\n" },
  },
];

describe('package boundary rules', () => {
  for (const c of cases) {
    test(c.name, async () => {
      const found = await violations(buildRepo(c.files, c.repo ?? {}));
      if (c.rule) {
        expect(found).toContain(c.rule);
      } else {
        expect(found).toEqual([]);
      }
    });
  }

  test('every rule is exercised by at least one case', () => {
    const exercised = new Set(cases.flatMap((c) => (c.rule ? [c.rule] : [])));
    const missing = forbidden
      .flatMap((r) => (r.name ? [r.name] : []))
      .filter((n) => !exercised.has(n));
    expect(missing).toEqual([]);
  });
});

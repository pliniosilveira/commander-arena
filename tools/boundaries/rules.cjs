// Package-boundary rules, shared by the real run (`pnpm lint:boundaries`) and by the test
// that proves the rules reject forbidden imports (tools/boundaries/boundaries.test.ts).
// Paths are relative to the cruise base directory (the repo root).
//
// Layering (docs/SPEC.md 4.1, 17.7):
//   engine  : pure rules engine. No DOM, no Node, no network, no other package, one npm dep (zod).
//   cards   : may use the engine's public API. No ai, no web.
//   ai      : may use the engine's public API only. No cards, no web, no Node or DOM.
//   web     : may use every package's public API.
// "Public API" of a package is its src/index.ts. Deep imports are forbidden. The one exception is
// the engine's test-only entry, src/testing/index.ts (the scenario DSL, `@commander-arena/engine/
// testing`): any package may import it, but only from test code (`engine-testing-entry-tests-only`).
// The purity rules (no Node built-ins, npm allowlist) apply to a package's src/ only: its tests
// may import vitest and Node. The layering rules apply to the whole package, tests included.

const ENGINE = '^packages/engine/';
const ENGINE_SRC = '^packages/engine/src/';
const CARDS = '^packages/cards/';
const AI = '^packages/ai/';
const AI_SRC = '^packages/ai/src/';
const ANY_PACKAGE = '^packages/';
const WEB = '^apps/web/';
const NPM = '(^|/)node_modules/';
const ENGINE_TESTING_ENTRY = '^packages/engine/src/testing/index\\.ts$';
// zod is the only npm dependency the engine may import. Matches the flat and pnpm layouts.
const ENGINE_ALLOWED_NPM = [
  '(^|/)node_modules/zod/',
  '(^|/)node_modules/\\.pnpm/zod@[^/]+/node_modules/zod/',
];

/** @type {import('dependency-cruiser').IForbiddenRuleType[]} */
const forbidden = [
  {
    name: 'engine-no-other-packages',
    comment: 'The engine is the bottom layer. It must not import cards, ai or web code.',
    severity: 'error',
    from: { path: ENGINE },
    to: { path: ['^packages/(cards|ai)/', '^apps/'] },
  },
  {
    name: 'engine-no-node-builtins',
    comment: 'The engine is pure: no fs, path, crypto, timers or other Node built-ins.',
    severity: 'error',
    from: { path: ENGINE_SRC },
    to: { dependencyTypes: ['core'] },
  },
  {
    name: 'engine-npm-allowlist',
    comment: 'The engine may import only zod from npm. UI, network and DOM libraries are out.',
    severity: 'error',
    from: { path: ENGINE_SRC },
    to: { path: NPM, pathNot: ENGINE_ALLOWED_NPM },
  },
  {
    name: 'ai-only-engine',
    comment: 'The AI depends only on the engine public API, never on cards or the web app.',
    severity: 'error',
    from: { path: AI },
    to: { path: ['^packages/cards/', '^apps/'] },
  },
  {
    name: 'ai-no-node-builtins',
    comment: 'The AI runs in a Web Worker. No Node built-ins.',
    severity: 'error',
    from: { path: AI_SRC },
    to: { dependencyTypes: ['core'] },
  },
  {
    name: 'ai-npm-allowlist',
    comment: 'The AI imports no npm packages. It depends on the engine and nothing else.',
    severity: 'error',
    from: { path: AI_SRC },
    to: { path: NPM },
  },
  {
    name: 'cards-no-ai-or-web',
    comment: 'Card data and parsing do not depend on the AI or the UI.',
    severity: 'error',
    from: { path: CARDS },
    to: { path: ['^packages/ai/', '^apps/'] },
  },
  {
    name: 'packages-no-apps',
    comment: 'Library packages never import application code.',
    severity: 'error',
    from: { path: ANY_PACKAGE },
    to: { path: '^apps/' },
  },
  {
    name: 'public-api-only-from-packages',
    comment:
      'A package may import another package only through its src/index.ts, never its internals.',
    severity: 'error',
    from: { path: '^packages/([^/]+)/' },
    to: {
      path: '^packages/[^/]+/',
      pathNot: ['^packages/$1/', '^packages/[^/]+/src/index\\.ts$', ENGINE_TESTING_ENTRY],
    },
  },
  {
    name: 'public-api-only-from-web',
    comment: 'The web app imports packages only through their src/index.ts.',
    severity: 'error',
    from: { path: WEB },
    to: {
      path: '^packages/[^/]+/',
      pathNot: ['^packages/[^/]+/src/index\\.ts$', ENGINE_TESTING_ENTRY],
    },
  },
  {
    name: 'engine-testing-entry-tests-only',
    comment:
      'The scenario DSL (the engine testing entry) is test support: only test code imports it, so it is never part of a production bundle.',
    severity: 'error',
    from: {
      path: '^(packages|apps|tools)/',
      pathNot: ['^packages/engine/src/testing/', '(^|/)(test|tests|e2e)/', '\\.test\\.tsx?$'],
    },
    to: { path: ENGINE_TESTING_ENTRY },
  },
  {
    name: 'no-circular',
    severity: 'error',
    comment: 'No import cycles.',
    from: {},
    to: { circular: true },
  },
  {
    name: 'not-to-unresolvable',
    severity: 'error',
    comment:
      'Every import must resolve. An unresolvable import usually means a missing dependency.',
    from: {},
    to: { couldNotResolve: true },
  },
];

module.exports = { forbidden };

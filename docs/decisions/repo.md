# Repository decisions

Entries keep their old numbers (see `README.md`).

## Stack and layout

- **D-029, D-030, D-032 Stack.** Biome and dependency-cruiser; React 19, Zustand, Comlink; Zod for serialized data; pnpm pinned in `packageManager` with its release-age guard; TypeScript 6.0.3 (the boundary test fails when a cruise scans no TypeScript file); exact dependency versions. Deviations need a decision bullet.
- **D-031 Determinism is enforced by tools.** Engine and AI tsconfigs set `lib: ES2023` and `types: []`; a Biome GritQL plugin (`tools/lint/no-nondeterminism.grit`) bans `Math.random`, `Date.now`, `new Date`, `performance.now`, `localeCompare` and `toLocaleString` in `packages/engine/src` and `packages/ai/src`.
- **D-033 Boundary rules are tested** by building throwaway monorepos for each case; a meta test fails when a rule has no case.
- **D-012, D-037 The scenario DSL** is in the engine's public API as the test-only entry `@commander-arena/engine/testing`; it writes the initial state directly and performs every later step through `applyAction`.
- **D-015 Cite rules** as `CR 702.19b (Trample)`; look rules up with `pnpm rule` (D-024).
- **D-016 MIT license** for the code; card data and images are never committed except precon snapshots.

## Checks and CI

- **D-013, D-126, D-132, D-250, D-498, D-637 Test tiers.** `pnpm test` is exhaustive. `pnpm test:pr` defers the long game suites listed in `tools/test/pr-excluded.json` (`run-tier.ts` fails if an exclusion excludes nothing). The `Full` workflow runs everything nightly, only when `main` has a new commit, and opens an issue on failure. `Soak` plays 500 games on demand.
- **D-090, D-410 Coverage** is checked on every PR by its own workflow (`pnpm coverage:cards --download --check` against `reports/coverage-baseline.json`) and published weekly on GitHub Pages, not committed.
- **Versions and generated files once per deck PR (PR 291).** A deck build bumps `PARSER_VERSION` and `ENGINE_VERSION` and regenerates the golden snapshot and derive digests once, after the last group and a merge of `main`; per-group bumps made every merge conflict. Those checks stay red until then.
- **D-035 Rules baseline.** The CR effective 2026-09-25 plus the Mystery Booster Commander Edition bulletin, applied by reference in the docs; rule numbers are cited with titles because the 7xx numbering shifted.

## Public repository

- **D-246, D-247 Wizards' text is not committed.** The CR text and bulletins are fetched with `pnpm rules:fetch` and ignored by git; cloud sessions read them from the owner's private repository `pliniosilveira/commander-arena-rules` (never copy its files here). Scryfall card data and precon snapshots stay. The tests that read the CR skip without it.
- **D-249 The repository is public.** Workflows are pinned to commit hashes; `SECURITY.md` asks for private vulnerability reports; `node tools/public/preflight.ts` scans the tracked files before a push. Session links, e-mail addresses and an employer's name stay out of commits, comments and pull requests.

## Documentation

- **D-022, D-169 No status files.** `docs/STATUS.md` and `docs/progress/` were removed; checklists live in the pull request description and S-class proposals in an issue comment. `docs/SPEC.md` is a short current specification.
- **Decisions** are kept as described in `docs/decisions/README.md`; the old log was condensed on 2026-11-18.

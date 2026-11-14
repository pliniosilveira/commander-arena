# AGENTS.md

Standing instructions for any coding agent working in this repository. `CLAUDE.md` imports this file, so every tool gets the same text. Update it when a convention changes.

## What this project is

Commander Arena is an unofficial, free, browser-based Magic: The Gathering Commander game: one human against an AI in v1, driven by a pure TypeScript rules engine that follows the Comprehensive Rules (CR). It runs entirely in the browser and deploys as a static site.

The long-term goal is that the engine supports 100% of the existing cards; a card that costs a lot is built later, not left out (D-317).

Priorities, in order: rules correctness for every card marked supported; honesty (a card the engine does not fully understand is flagged, never guessed); determinism and testability; a legal and competent AI; polish.

Authoritative documents: `docs/SPEC.md` (the short current specification; section 17 is the index of amendments A1 to A31, whose results are in sections 1 to 16) and `docs/DECISIONS.md`. When the SPEC and the CR disagree, the CR wins; record the discrepancy in `docs/DECISIONS.md`.

## Session start checklist

1. Read this file.
2. Read `docs/STATUS.md`: current milestone, what is done, blockers, next steps.
3. Read the SPEC sections your task touches: engine 4 and 5, cards 6 to 8, AI 9, UI 10, tests 12, milestones 15; section 17 only to resolve an amendment number cited in the code.
4. Skim `docs/DECISIONS.md` for entries in the area you will change. Check `docs/ARCHITECTURE.md` to see what exists and what is only planned.
5. Run `git status` and `git branch --show-current`. Work on a branch of its own for the task (`support-<deck>`, `fix-<topic>`, `feat-<topic>`), never on `main`.
6. Run the checks once to learn the baseline (commands below).

## Setup and commands

Needs Node 22 (`.nvmrc`) and the pnpm version pinned in `packageManager` in `package.json`. Dependencies are pinned exactly (`.npmrc` sets `save-exact`).

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies. |
| `pnpm dev` | Start the Vite dev server for `apps/web`. |
| `pnpm typecheck` | Run `tsc` in every package, in `apps/web` and in `tools`. |
| `pnpm lint` | Biome check, then the dependency-cruiser boundary rules (`pnpm lint:boundaries` runs only the latter). |
| `pnpm test` / `pnpm test:exhaustive` | Vitest across all projects with every test enabled, including the 200-game combat regression, AI game suites and precon soak. This is the exhaustive tier; nightly `Full` also runs it in four shards (D-250). |
| `pnpm test:pr` | The required-PR unit tier across all projects, including all fast AI tests. It keeps parser/golden correctness and precon deck-loading checks and uses the fixed-seed combat smoke. Exact AI game suites deferred to nightly are listed in `tools/test/pr-excluded.json`; the 200-game combat run, fixed 100-game AI check, 60-game combat group, precon full-game soak and repeated golden timing loop are explicitly tiered. CI uploads Vitest's test/import timing log and JSON results. |
| `pnpm test:focus -- <test-path> [<test-path> ...]` | Run exactly the supplied test paths without PR exclusions, so focused tests retain their full behavior. Focused selection is assistance, not proof: follow with affected integration checks and use the broader PR tier for unknown/shared changes. |
| `pnpm test:soak` | The AI soak tests with 100 games each. The manual `Soak` workflow plays 500 on demand (D-132). |
| `pnpm e2e` | The Playwright browser tests of `apps/web` (needs Chromium; see `docs/STATUS.md`). The nightly `Full` workflow runs them (D-250). |
| `pnpm build` | Build packages and apps. Packages are consumed from source, so today only `apps/web` really builds. |
| `pnpm format` | `biome check --write .`: format and apply safe fixes. |
| `pnpm rule <number>` | Print a CR rule and its subrules from `docs/rules/comprehensive-rules.txt`. The file is Wizards' text and is not committed (D-246): fetch it with `pnpm rules:fetch`, or use a copy elsewhere with `pnpm rule --file <path>` or `COMMANDER_ARENA_CR_FILE`. |
| `pnpm rule --search <text>` | Find CR rules by title or text. |
| `pnpm rules:fetch` | Download the CR text into `docs/rules/` (git ignores it). Needs network access to Wizards of the Coast, so the owner runs it. |
| `pnpm coverage:cards --file <oracle_cards file>` | Run the card pipeline over Scryfall's bulk file; write `reports/coverage.md`, `reports/backlog.md` and `reports/templates.json`. `--download` fetches the file (network, owner only); `--check` compares with `reports/coverage-baseline.json`; `--update-baseline` rewrites it. See `docs/CORPUS.md`. |
| `pnpm corpus:templates --file <oracle_cards file>` | The same run, writing only `reports/backlog.md` and `reports/templates.json`. |
| `pnpm corpus:replay` | Replay the real example line of each template in `reports/templates.json` through today's parser; write `reports/template-replay.md`. Offline; an ability-level estimate, never a coverage number. |
| `pnpm corpus:decks --file <oracle_cards file> --deck <decklist> [--deck ...]` | Per-deck coverage: how much of each decklist (a file, or a folder of `.txt` files such as `decks/`) the engine fully supports, which cards block it and which shared blockers to fix first; writes `reports/decks.md`. Offline; owner supplies the real lists (`docs/CORPUS.md`). |
| `pnpm corpus:check-issue --body <file> [--card-data <file>]` | Is a "deck support" issue complete? What counts is the names of the unsupported cards (the `Unsupported cards (N)` line, or the `cards:` lines of the template report) and their card data (the description's block, or the comment the workflow fetched, `--card-data`); the decklist, the template report and the build line are `notes` when missing (D-251, D-290). One JSON line `{ complete, problems, notes, needsCardData, ... }`; exit 0 complete, 1 not. Offline. |
| `pnpm corpus:fetch-card-data --body <file> --out <file> [--digest <sha256>]` | The card data of an issue that has none of its own: looks the unsupported names up on Scryfall through the app's client and writes the comment the deck support workflow posts (D-290). Runs on a GitHub runner, which can reach Scryfall; a cloud session cannot. Exit 0 written, 1 Scryfall could not give the cards. |
| `pnpm corpus:from-issue --body <file> --issue <number>` | Add the unsupported cards a support issue carries (the import screen's "Ask for support on GitHub" button writes them, compressed, into the description) to the golden corpus as acceptance cards. Offline: save the issue's description to a file first. The way to get real card text in a cloud session, which cannot reach Scryfall (D-245, `docs/CORPUS.md`). `--fetched`: the file is the workflow's card data comment, not a description (D-290). |
| `node tools/public/preflight.ts [--root <dir>]` | Scan the tracked files for what must not be in a public repository: Wizards' text (D-246), secret-looking strings, e-mail addresses, links to private Claude sessions, and an employer's name when `PREFLIGHT_EMPLOYER` gives one. Tree only, not the history. Exit 1 on a finding. |
| `pnpm ai:arena --a <random\|casual\|greedy\|heuristic> --b <...> --games <even number> --seed <n> [--real-clock] [--precons [--pairing mirror\|cross]] [--log-slow <ms>]` | Plays two agents against each other on paired seeds with the seats swapped, on mirrored arena decks (or, with `--precons`, on the real precons of `apps/web/src/precons/snapshots/`, mirrored or precon against precon), and prints wins per agent and seat, draws, average turns, fallbacks, the reason histogram and the mean and slowest decision time of each agent (D-162, D-163, D-164). 200 games take several minutes (about 10 minutes on the precons); it is not part of any test run. |
| `pnpm corpus:extract --file <oracle_cards file> --names <names file>` | Extract the named real cards into the golden corpus fixtures (`docs/CORPUS.md`; owner runs it). |
| `pnpm precon:snapshot --file <oracle_cards file> --deck <decklist> --id <id> --name "<name>" --blurb "<sentence>"` | Write the card-data snapshot of one precon, `apps/web/src/precons/snapshots/<id>.json`: the decklist as given plus the stored cards it names, read from the bulk file (no network; the owner runs it and commits the file). The web app lists only the precons that have a snapshot (D-137). See `docs/CORPUS.md`. |
| `pnpm creature-types:generate` | Regenerate `packages/engine/src/data/creature-types.ts` from CR 205.3m in `docs/rules/` (D-106). Never edit that file by hand; `tools/creature-types/creature-types.test.ts` fails when it differs from the rules text. |
| `pnpm planeswalker-types:generate` | Regenerate `packages/engine/src/data/planeswalker-types.ts` from CR 205.3j in `docs/rules/` and the planeswalker types an applied bulletin adds to it (D-200). Never edit that file by hand; `tools/creature-types/planeswalker-types.test.ts` fails when it differs from the sources. |

`pnpm coverage:cards` and `pnpm corpus:templates` need the Scryfall hosts that the cloud sandbox blocks, so the owner runs them locally and commits or pastes the results (`docs/CORPUS.md`); never invent report numbers. `pnpm corpus:replay` runs offline and is the work order between two owner runs. `pnpm corpus:decks` needs the bulk file the owner already has, plus decklists the owner supplies; it never invents a deck.

While you work, run what your change touches (D-126): `pnpm typecheck`, `pnpm lint`, the focused test paths (`pnpm test:focus -- <paths>`), then the affected packages and integration checks. `vitest related` is assistance, not proof: public barrels can over-select and runtime fixture dependencies can under-select. Run only the browser tests you added or changed. Mutation checks are for engine rules only: a handful of targeted ones per mechanic, on a scratch copy.

Before a pull request: `pnpm format`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test:pr`. The PR tier runs deterministic rules/parser checks, all golden support/AST/diagnostic assertions, fast AI tests, the fixed combat smoke and precon loading; full game soaks and the repeated golden timing loop remain exhaustive/nightly. `pnpm test` and `pnpm test:exhaustive` still run every unit test. The complete suite and browser tests run nightly on `main` in the scheduled `Full` workflow (D-250), skipped when no commit entered `main` since its last scheduled run; a failure opens an issue. `pnpm test:soak` (100 games) and the manual `Soak` workflow (500 games) stay on demand. No tool formats Markdown, so keep `.md` files clean by hand.

Scripts under `tools/` are TypeScript run with `node file.ts` (Node type stripping). Use erasable syntax only, explicit `.ts` extensions on relative imports and Node built-ins only; do not add an npm dependency for tooling without a `D-` entry.

## Repository map

| Path | Contents |
| --- | --- |
| `packages/engine` | Pure rules engine. Public API is `src/index.ts`. Rules in `src/rules/`, mana in `src/mana/`, the AST in `src/ast/`, fixtures in `src/cards/fixtures/`, the scenario DSL in `src/testing/` (the test-only entry `@commander-arena/engine/testing`, not part of `src/index.ts`). |
| `packages/cards` | Decklist parsing, Scryfall client and cache, the two-stage Oracle text parser (`src/convert/parser/`), the engine's real-card fixtures as the hand-written route (`src/convert/override.ts`), deck validation, coverage tooling. |
| `packages/ai` | `Agent` interface, `RandomLegalAgent`, `CasualAgent` (the web opponent, `src/casual-*.ts`), `GreedyAgent`, `HeuristicAgent` (`src/heuristic-*.ts`, D-163), the board evaluator, `playMatch` (D-162), `runGame`/`replayGame`. Depends on the engine public API only. |
| `apps/web` | React + Vite UI. The engine and AI run in a Web Worker (D-044). |
| `tools/boundaries` | dependency-cruiser rules (`rules.cjs`) and the test that proves they reject forbidden imports. |
| `tools/lint` | Biome GritQL plugin that bans nondeterministic APIs, and its test. |
| `tools/rules` | `pnpm rule` lookup and the CR downloader. |
| `tools/corpus` | `pnpm coverage:cards`, `pnpm corpus:templates`, `pnpm corpus:extract` over Scryfall's bulk file (owner runs them locally), `pnpm corpus:replay` (offline) and `pnpm corpus:decks` (per-deck coverage). |
| `tools/ai` | `pnpm ai:arena`: the match harness of `packages/ai` on the command line, with a decision-time report (D-162, D-163), the real precon decks for it and the precon soak test (`precons.ts`, `precons.test.ts`, D-164). |
| `tools/creature-types` | `pnpm creature-types:generate` and `pnpm planeswalker-types:generate`: the creature type table and the planeswalker type table of the engine, read from the CR text, and their tests. |
| `tools/perf` | The derive benchmark and the precon fingerprint (D-173): `node tools/perf/derive-bench.ts` times `getView`, `getLegalActions` and `applyAction` on late precon boards, `node tools/perf/precon-digest.ts` fingerprints whole precon games to compare two engine versions. Not part of any test run. |
| `tools/public` | `preflight.ts`: the check of the tracked files for what must not be in a public repository (run it before every push). |
| `tools/precon` | `pnpm precon:snapshot`: the card-data snapshot of a precon, from the bulk file and a decklist of `decks/` (D-137). |
| `.claude/skills/deck-support` | The routine that builds a complete "deck support" issue from anyone, oldest first, when the token budget allows (D-251); `tools/corpus/check-issue.ts` and `.github/workflows/deck-support-triage.yml` decide whether the issue is complete. |
| `decks/` | Real decklists the owner supplies, one `.txt` per deck, for `pnpm corpus:decks`; `README.md` says how. |
| `docs/` | `SPEC.md`, `DECISIONS.md`, `STATUS.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `progress/`, `rules/` (CR text, version record, bulletins). `RULES_COVERAGE.md`. `MECHANICS.md`, `CARD_SUPPORT_PLAYBOOK.md`, `design/` (implemented design proposals), `proposals/` (proposals awaiting work). |

All four packages are real. `docs/ARCHITECTURE.md` marks what is real and what is planned, `docs/MECHANICS.md` is the per-mechanic reference, and `docs/RULES_COVERAGE.md` lists rules by CR section.

## Codebase rules

- **Engine purity.** `packages/engine` has no DOM, network, timers, Node built-ins or randomness. It may import only itself and `zod`. Enforced by: tsconfig `lib: ["ES2023"]` with `types: []` (DOM, timer and Node globals do not type-check in `src`); dependency-cruiser rules that forbid Node built-ins, other packages and any npm package except `zod`; the Biome plugin below. Do not weaken any of these to make code compile.
- **Layering.** `engine` imports nothing from the repo. `cards` may import the engine. `ai` may import only the engine, and no npm packages or Node built-ins. `web` may import all packages. `pnpm lint` fails on a violation.
- **Public API only.** Every cross-package import goes through the target's `src/index.ts`. No deep imports, including from tests. The one exception is the scenario DSL, a test-only entry of the engine (`@commander-arena/engine/testing`) that only tests and e2e files may import.
- **One way to change state.** The engine's `applyAction(state, seat, action)` is the only mutation path. The UI and the AI use the same API. Manual adjustments, concede and auto-passes are ordinary actions in the action log. Never mutate state from the UI, the AI or a card override.
- **Who controls a permanent is derived.** Read it with `controllerOf(state, obj)` (`rules/control.ts`, D-189), never from `GameObject.controller` (the player the object entered under, and what a spell or ability on the stack has): a control-changing effect is a layer 2 effect and the field does not show it. `packages/engine/test/control-reads.test.ts` fails when a rule reads the field of an object directly.
- **No card-name special cases in engine code.** Card-specific data lives only in the engine's real-card fixtures, never in code, and goes through engine primitives.
- **Tests first for mechanics.** Write the failing scenario test, then the code. Scenario tests use the scenario DSL in `packages/engine/src/testing` (`scenario()`, `g.act(seat).cast(...)`, `g.expect...`), which drives everything through `applyAction`. Support is proven per grammar rule and primitive, not per card. Never mark a card supported without tests.
- **Determinism.** All randomness comes from the seeded PRNG stored in state; the AI has its own PRNG. Time comes in as an injected parameter. `tools/lint/no-nondeterminism.grit` bans `Math.random`, `Date.now`, `new Date`, `performance.now`, `localeCompare` and `toLocaleString` in `packages/engine/src` and `packages/ai/src`. Do not add suppressions. To ban another API, add a pattern to the plugin and a case to `tools/lint/nondeterminism.test.ts`.
- **Honesty about unsupported cards.** A card is supported or unsupported, never "partially". Text the engine does not understand is dropped entirely, never half-executed, and flagged to the player. Never guess at what a card does.
- **Never invent data.** No made-up card data, CR text or bulletin names or dates. If you could not fetch it, say so in the docs and mark it unverified. Test fixtures that are not real Scryfall data must say `SYNTHETIC` in the file.
- **Cite rules by number and title**, for example `CR 702.19b (Trample)`, in comments on non-obvious logic. Look rules up with `pnpm rule` instead of writing them from memory.
- **No stubs in supported paths.** No TODO placeholders, fake return values or "simplified" logic in code a supported feature can reach. Deferred work goes in `docs/ROADMAP.md`.
- **Dependencies and files.** Pin exact versions. Changing the stack needs a new `D-` entry. Keep modules small and well named, under about 400 lines where practical.
- **Boundary rules are tested.** Adding or changing a rule in `tools/boundaries/rules.cjs` needs a failing case in `tools/boundaries/boundaries.test.ts`.
- **Style.** Biome formats and lints: single quotes, semicolons, 100 columns, no `any`, no non-null assertions, no unused imports or variables.

## Documentation duties

| Document | Update when |
| --- | --- |
| `docs/STATUS.md` | Every session, as the last thing you do. |
| `docs/DECISIONS.md` | Whenever you make a decision, including any deviation from the SPEC's stack defaults. |
| `docs/ARCHITECTURE.md` | A module, type or data flow changes. Move items from planned to real in the same change. |
| `docs/ROADMAP.md` | Work is deferred or a known limitation is found. |
| `docs/RULES_COVERAGE.md` | Rules support changes. |
| `docs/MECHANICS.md` | A mechanic is added (from M5). |
| `docs/progress/M<n>.md` | A milestone ends: what is done, test status, coverage numbers, known gaps, decisions made. |
| `README.md` | User-facing behavior changes. |
| `docs/SPEC.md` | Only with the human's approval. |

Decision template (the same text sits at the top of `docs/DECISIONS.md`; use the next unused number, newest at the bottom):

```markdown
## D-<number>: <title> (<date>)
- Context: <what forced a choice>
- Decision: <what you chose>
- Alternatives: <what you rejected and why>
- Consequences: <what this makes easier or harder>
```

Do not write a test count into any document; it goes stale. Say how to run the checks instead.

## Git workflow

- One branch and one pull request per task (a deck, a fix, a feature), named for it (`support-niv-mizzet`, `fix-auto-mana`). A branch that needs the changes of a pull request that is not merged yet is cut from that pull request's branch, and the pull request says "stacked on #N". Merge to `main` only after all checks pass. `main` is always deployable.
- Never push to `main` directly.
- Commit messages: a short imperative subject, then a body that says why. Attribution trailers are added by the harness; do not hardcode a model name.
- Do not rewrite history that others may have pulled. A conflict is resolved by merging `main` in; a conflict in a generated file (the golden snapshot, the version constants, the derive digests) by merging and regenerating it with the repository's command, never by hand.
- The GitHub tool that opens a pull request appends a footer with a link to the private session to its description, and this repository is public: edit the description right after creating the pull request, to remove that line (the edit stays removed), and keep session links out of commits and comments.

## Card support

The procedure for adding support for a card is `docs/CARD_SUPPORT_PLAYBOOK.md`. In short: research the card and its rulings, classify the gap (T template, P primitive, K keyword, S subsystem, O one-off override), write tests first, implement the general fix, run the checks of your change (the full suite runs every night on GitHub), then record it in `docs/MECHANICS.md`. An S-class gap needs a proposal in `docs/proposals/` and the human's approval first.

## Network

Cloud sessions run under an organization-managed network policy: `api.scryfall.com`, `*.scryfall.io`, `magic.wizards.com` and `media.wizards.com` are blocked, npm works, and only an admin can change it. Work that needs those hosts (`pnpm rules:fetch`, later `pnpm coverage:cards`) is run by the owner on a local machine and the result is committed or pasted. The CR text is not in the repository (D-246): a cloud session gets it from the owner's private repository `pliniosilveira/commander-arena-rules` (attach it with `add_repo`, clone it, then `pnpm rule --file <clone>/comprehensive-rules.txt` or `COMMANDER_ARENA_CR_FILE=<clone>/comprehensive-rules.txt`; never copy its files into this repository), or from a copy the owner provides; without it, do not write rule text from memory: cite a rule only as far as the code, the docs and `docs/DECISIONS.md` already do, and say when a rule could not be checked. The tests that read it skip without it. One lawful way to read Scryfall from a cloud session: the workflow `Scryfall lookup` (D-294), started by hand or by the agent with a path such as `cards/named?exact=Sol+Ring` or `cards/<id>/rulings`, runs on a GitHub runner and prints the answer in its log. Otherwise do not work around a block, and do not substitute invented data for data you could not fetch.

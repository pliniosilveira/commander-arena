# Architecture

**Current state.** All four packages are real. The engine runs the whole two-player Commander turn structure, casting, the stack, combat, triggered, activated and static abilities, layers, replacement and prevention effects, tokens, copies and the multi-face layouts; the Oracle parser turns card text into engine definitions; `CasualAgent` plays the web opponent; the web app plays a full game against it from real precons or an imported deck. What is still planned is marked PLANNED below (the stronger AI agents of M7, save and resume, replay import, animation, multiplayer).

Token pictures (D-494) use the optional `ObjectView.tokenDefinition`: the original token characteristics and abilities, also carried by its stack abilities from the live source or last-known information, never exposed face down. `packages/cards/src/scryfall/token-query.ts` builds the exact search; the web's `token-art.ts` caches one promise per query and uses the existing Scryfall request queue. Only a single result with HTTPS Scryfall image files replaces the drawn frame. `image-uris.ts` shares image validation with the Manifest picture lookup. No stored-card or precon snapshot changes.

Token searches restrict results to standalone `layout:token` cards (D-495). Double-faced token printings otherwise count as separate cards even when the requested face is the same token, causing the ambiguity fallback. Tokens with no standalone match still retain their drawn frame.

The type line is matched by an escaped, anchored regex; tokens with no abilities and no rules text also exclude any Oracle text (`-o:/./`, D-496). A plain Zombie therefore cannot accidentally match an enchantment Zombie or one with decayed. Tokens with abilities retain their positive ability-word refinements and the ambiguity fallback.

## How to read this document

| Tag | Meaning |
| --- | --- |
| **REAL** | Exists in the repository and is checked by a command or a test. |
| **PREPARED** | Written but not yet run, because it needs network access that the environment blocks. See the issue or pull request that says so. |
| **PLANNED (M<n>)** | Intent only. No code exists. `M<n>` is the milestone that builds it, from SPEC section 15. Where the SPEC names no milestone for an item, the entry says "inferred" and names the milestone whose done-when needs it. |

Anything without a tag is a definition, not a claim about the code. When you build something, move it from PLANNED to REAL in the same change.

Rule numbers in this document were checked against the CR effective September 25, 2026 in `docs/rules/` (D-035). Numbers from 713 upward shift by one in the next CR file; cite by number and title.

## Module map

### Packages and apps

| Path | Status | Today | Planned |
| --- | --- | --- | --- |
| `packages/engine` | REAL | The rules engine (M1): `createGame`, `applyAction`, `getLegalActions`, `legalActionsForDecision`, `getView`, `checkInvariants`, `stateHash`; modules under `src/rules/` (zones, derive, sba, settle, select, effects, stack, cast, flow, priority, legality, mana-engine, mana-abilities, mana-sources, mana-outcomes, setup, and for combat: damage, keywords, combat-legality, combat, combat-flow, and for M5 S2: triggers, trigger-stack, sacrifice, tokens, source-info, and for the mana and lands slice: conditions, enters, statics, and for slice S3: ability-object, activate, activate-legality, activate-costs, continuous, and for slice S4a: attach, derive-statics, filter-match), `src/mana/` (cost parser and payment planner), `src/rng/` (seeded xoshiro128**), `src/ast/` (AST types, `validateCard`, `SUPPORTED_FEATURES`), `src/data/` (`creature-types.ts`, generated from CR 205.3m by `tools/creature-types/`), `src/cards/` (`tokens.ts`, the predefined tokens of CR 111.10) and `src/cards/fixtures/` (real-card fixtures and SYNTHETIC test cards, among them `synthetic-triggers.ts`) and `src/testing/` (the scenario DSL, a test-only entry `@commander-arena/engine/testing` that `src/index.ts` does not export). | Activated and static abilities, layers, replacement library (M5, later slices). PLANNED. |
| `packages/cards` | REAL (M4) | `decklist/` (scanner, canonical deck), `scryfall/` (zod schema, rate-limited queue, cache interface, name resolution), `convert/` (Scryfall card to engine definition; the two-stage parser, see "Parser pipeline" below; fixture overrides, support cache), `corpus/` (the golden corpus record shared by the golden test and `pnpm corpus:extract`), `validate/` (Commander rules, partner pairs), `types.ts` (the shared plain-data contract). | Code overrides with `defineOverride` (D-067) are not built; the community definitions were removed (D-167); the hand-written route is the engine's real-card fixtures. |
| `packages/ai` | REAL | `Agent` interface with time budget and injected clock, `RandomLegalAgent` (its own seeded PRNG, exhaustive decision handlers; for engine tests and soaks), `CasualAgent` (the former web opponent, D-051: `src/casual-*.ts`, one module per family of decisions; today the opponent of `?autostart` and of the tests, and the base of the other agents), `runGame` and `replayGame`. M7b (D-162): `evaluate.ts` (the board score, every term labelled), `reasons.ts` (reason codes and the `ExplainingAgent` type), `greedy-agent.ts` and `greedy-combat.ts` (`GreedyAgent`, the A11 benchmark, built on the casual handlers), `arena.ts` and `arena-decks.ts` (`playMatch`, paired seeds with swapped seats; a deck entry is a mirror or, since M7d, a `[seat 0, seat 1]` pair, and the arena decks). M7c (D-163): `heuristic-agent.ts` (`HeuristicAgent`, composed on the casual handlers), `heuristic-sim.ts` (plays a determinized sample forward with `applyAction`), `heuristic-danger.ts` and `heuristic-duel.ts` (what gets past blockers, lethal and danger tests, one creature against another), `heuristic-blockplan.ts` and `heuristic-blocks.ts` (tiered block plans scored on the sample), `heuristic-attacks.ts` and `heuristic-crack-back.ts` (lethal check, candidate attacks, crack-back, library clock), `heuristic-combat-look.ts` and `heuristic-attack-look.ts` (issue 653, step 5: with two players the best attacks and blocks are played on to the agent's next turn by the planner's inner agents and chosen by that position; the crack-back formula is the fallback), `heuristic-response-look.ts` (step 6: a counterspell is cast or held, and the best removal targets chosen, by playing them to the end of the turn or the next turn), `heuristic-model.ts` (what the agent has seen of the opponent's blocking), `heuristic-mana.ts`, `heuristic-lands.ts` and `heuristic-main.ts` (mana estimate, land choice, the set of spells that uses the most mana, instant-speed windows), `heuristic-targets.ts` (removal targets), `heuristic-delta.ts`, `heuristic-protect.ts`, `heuristic-mulligan.ts`, `heuristic-budget.ts` (`Think` and the budget of a decision: every search of the decision, vetting, planner, attacks and blocks, makes its engine calls through one counter and stops at a fixed amount of work weighed by board size, so play does not depend on the device; the clock is only a safety cutoff). The main phase goes through the turn planner (issue 624): `heuristic-plan.ts` scores the lines of `heuristic-plan-lines.ts` on the threat scenarios of `heuristic-threats.ts` with `heuristic-plan-sim.ts` (opponents played by the agent's own rules without a sample) and follows the chosen plan while the board print of `heuristic-plan-print.ts` matches; `heuristic-plan-work.ts` counts what each planning costs (views, engine actions, play-outs, steps) and whether the clock or the work cut it, draws its calls from the decision's budget, and keeps the views and applied actions of the planning by state (up to a bound of memory), so lines that share their first steps take them once; `heuristic-plan.ts` asks a driver for each play-out (`planning`, a generator): `choosePlan` plays it on the agent's thread, `heuristic-plan-pool.ts` (`choosePlanOn`) hands it to the pool a host offers in `DecideContext.playOuts` (`heuristic-plan-types.ts`) and settles the answered trace (`heuristic-plan-trace.ts`: the engine steps with their work, replayed against the decision's budget in the planner's order, so plans, work and cuts are the single thread's; `heuristic-plan-runner.ts` is the worker side). `heuristic-plan-deep.ts` (issue 653, step 4) plays the lines close to the best one turn further with two players: a generator that asks the same driver for each play-out at horizon 2, played and settled on the stretched bounds of `Budget.deep`, so it too is the same on one thread and on a pool. `heuristic-sets.ts` holds the shared spell sets. `heuristic-profile.ts` (issue 653) builds one profile per opponent from its whole decklist, read through the parsed abilities of `heuristic-card-traits.ts`, its pool on the sample and its battlefield (what it can still do, its archetype, how it wins); the threat scenarios and the crack-back ask only the questions it makes worth asking. `DecideContext.sample` (M7a, D-161) is what the combat modules play forward. | Search beyond one turn (MCTS), threat assessment for more than two seats (v2). PLANNED. |
| `apps/web` | REAL | A playable 1v1 game against `HeuristicAgent` (D-164, D-168; `CasualAgent` stays for `?autostart` and tests; the menu offers real precons, D-137; the fixture-only test decks are hidden and reachable by id only): Worker host (`src/game/`; `agents.ts` builds the opponent from `NewGameOptions.ai`, `autostart.ts` reads `?ai=`), zustand store with the A18 autopilot (`src/store.ts`, `src/policy/should-stop.ts`), board, hand, preview panel, stack, log and settings floating over the board and the action dock in the player's board (`App.tsx`, `styles.css`, `ui/panels/LogDock.tsx`, `SettingsDock.tsx`), decision overlays (including choosePermanent, orderTriggers and confirmOptional, M5 S2, the chooseCards card picker for library search, discard and put on top, M5: `ui/decisions/cards-picker.ts` and `CardPickerPanel.tsx`, and the arrangeCards dialog for scry, surveil and reorder: `ui/decisions/arrange.ts` and `ArrangePanel.tsx`), stack panel with arrows that shows a triggered or activated ability under its source, ability activation (`ui/decisions/abilities.ts`, `ability-label.ts`, `AbilityChooser.tsx`, M5 S3), log, settings, menu, game over (`src/ui/`). Combat screens (D-226): `ui/decisions/combat-damage-preview.ts` and `PassingDamagePanel.tsx` (the damage getting through, a dock panel of the declare blockers question), `DamagePanel.tsx` and `board-highlight.ts` (the division of combat damage as a dock panel, not a modal), `ui/board/combat-order.ts` and `BlockArrows.tsx` (declared blockers in the order of their attackers, an arrow from each blocker), `ui/board/combat-effects.ts` and `CombatEffects.tsx` (damage numbers, hit flash and the ghost of a creature that died, from the steps of each snapshot, with the Web Animations API; visual only; `ui/panels/animations.ts` is the Settings switch and the reduced-motion check). Card images load from Scryfall by name, with a drawn frame as the fallback. Playwright tests in `e2e/` (`pnpm e2e`). Decks and lands (D-215): `src/precons/choices.ts` (the decks a player can pick: precons, edited precons, saved decks as `saved:<id>`), `layered-client.ts` (snapshot first, Scryfall for the rest), `build.ts` (`createPrecons(snapshots, serviceFor, library?)`: `prepare` of saved decks and edited precons, `editorService`); `src/import/stores.ts` (`DeckStoreApi.overrides`, `saveOverride`, `removeOverride`: the records of edited precons in the `decks` store); `src/ui/use-deck-choices.ts`, `ui/import/PreconDecksView.tsx` and the editing banner of `InputPanel.tsx`; `src/version.ts` and `build-info.ts` (build id injected by Vite `define`); `src/ui/board/lands.ts` and `LandRow.tsx` (the land row in one line, equal basic lands overlapped sideways; `Row.tsx` keeps the others). Board and layout polish (D-239 to D-243): `ui/decisions/popover-place.ts` (pure: where a choice bubble goes, under its card, above it or pushed inside the layer), `Popover.tsx` and `use-popover-place.ts` (the frame of the layer's popovers, measured before paint and moved with a lifted hand card); `ui/board/emblems.ts` (pure: the small cards of a player's emblem strip), `Emblems.tsx` (the strip at the left of a battlefield: the monarch, the Ring and the emblems of the command zone) and `game/designations.ts` (the objects the page builds for the monarch and the Ring, ids `o-1` and `o-100` up, which no engine object has, so the preview and the hover treat them like any card); the Playwright test `e2e/scrollbars.e2e.ts` and its `harness/scroll.ts` read the geometry of every scroll area. | Animation and the full Arena-style UI (M8). PLANNED. Also REAL (M4): `src/import/` (import service, IndexedDB stores that fail soft, the environment wired in `main.tsx`) and `src/ui/import/` (import screens, loaded on demand; `diagnostics.ts` words the v2 unparsed reasons for the "Why unsupported?" dialog, `UnparsedList.tsx` renders them, and `blockSplit` in `model.ts` counts grammar-only, engine-only and both-blocked cards for the template panel). |

### Tooling and documents

| Path | Status | Contents |
| --- | --- | --- |
| `tools/boundaries/` | REAL | `rules.cjs` (the dependency-cruiser rules) and `boundaries.test.ts`. |
| `tools/lint/` | REAL | `no-nondeterminism.grit` (Biome plugin) and `nondeterminism.test.ts`. |
| `tools/rules/` | REAL | `pnpm rule` lookup (`rule.ts`, `cr-lookup.ts`, `rule-format.ts`), the CR parser (`cr.ts`, `cr-text.ts`, `cr-state.ts`, `cr-finish.ts`, `cr-types.ts`) and the `pnpm rules:fetch` downloader (`fetch-cr.ts`, `fetch-discover.ts`, `fetch-files.ts`). Tests use a SYNTHETIC fixture plus `cr-real.test.ts` over the committed real CR. |
| `tools/ai/` | REAL | `pnpm ai:arena` (`arena.ts`, `format.ts`): plays `playMatch` from the command line (`--a`, `--b`, `--games`, `--seed`, `--real-clock`, `--max-turns`, `--max-actions`; `--precons` with `--pairing mirror|cross` plays on the real precon decks, D-164; `--seats 3|4` with `--agents` plays `playTable`, each seed once per rotation; `--report` prints what each agent did, from the events of `table-events.ts` through `table-report.ts`, and `--events <file>` writes them) and prints the table and the mean and slowest decision time of each agent (`format.ts`, `formatTimes`; the timing wrapper reads a real clock, which is allowed in `tools/`), and for an agent that plans its turns the share of plannings, and of decisions that searched, that the clock or the work budget cut and their mean work (`formatPlanning`, `formatSearches`); it installs the resolution hooks of `tools/corpus/register.ts` and imports `@commander-arena/ai` through its public API (`tools/package.json` depends on it as `workspace:*`). `format.test.ts` pins the report. `precons.ts` builds the decks of `apps/web/src/precons/snapshots/` through the web app's own modules (`createImportService`, `snapshotClient`, `checkPlayable`) and `precons.test.ts` holds the precon soak of the HeuristicAgent (8 games, no fallback, no rejected action, every game finished). `benchmark.ts` plays the HeuristicAgent against the agent code of another commit (`baseline.ts` extracts it; it runs on this tree's engine) or, with `--opponent greedy`, against this tree's GreedyAgent, a fixed yardstick for comparing builds and `benchmark-stats.ts` scores pairs with a 95% interval. `tune.ts` tunes chosen weights by self-play SPSA (`spsa.ts`, the pure core) and writes a partial `AgentWeights` file the benchmark and the blunder suite (`AI_WEIGHTS`) check. |
| `tools/creature-types/` | REAL | `pnpm creature-types:generate` (`generate.ts`, Node built-ins only): parses CR 205.3m from `docs/rules/comprehensive-rules.txt` and writes `packages/engine/src/data/creature-types.ts`; `creature-types.test.ts` parses the rules again and compares the engine's table and the generated file, so the table cannot drift (D-106). Also `generate-planeswalker.ts` (`pnpm planeswalker-types:generate`): CR 205.3j plus the planeswalker types an applied bulletin adds, into `packages/engine/src/data/planeswalker-types.ts` (D-200), with its own test. |
| `tools/perf/` | REAL | `node tools/perf/derive-bench.ts` (D-173): the five real precons played by the casual agent to a late, big board, then the time of `getView`, `getLegalActions`, `applyAction` and a replayed turn on fresh copies of the biggest boards (mean, p99, slowest; `--seed-list` replays the seeds that had them); `node tools/perf/precon-digest.ts`: a fingerprint of whole precon games through the public API, to compare two versions of the engine line by line. Both read a real clock or a seeded `RandomLegalAgent` and are not part of any test run. |
| `tools/corpus/` | REAL (tool); first real run is the owner's | `pnpm coverage:cards` and `pnpm corpus:templates` (`cli.ts`, `main.ts`), see "Corpus and coverage tooling" below. Tested with a SYNTHETIC corpus in all three input forms. |
| Root config | REAL | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts` (Vitest projects), `tools/test/run-tier.ts` (explicit focused/PR selection; exhaustive `pnpm test` is unchanged), `.dependency-cruiser.cjs`, `.github/workflows/ci.yml` and `full.yml` (Vitest log and JSON timing artifacts). |
| `docs/` | REAL | `SPEC.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `RULES_COVERAGE.md`, `CARD_SUPPORT_PLAYBOOK.md`, `CORPUS.md`, `PRIOR_ART.md`, `progress/`, `design/`, `proposals/`, `rules/` (CR text, `RULES_VERSION.md`, `bulletins/`). |

`reports/` holds the generated coverage reports (`docs/CORPUS.md`); they are refreshed by the owner's runs.

## Corpus and coverage tooling

`tools/corpus/` measures how much of the format the parser supports and ranks what to teach it next. Owner instructions are in `docs/CORPUS.md`.

| Module | Role |
| --- | --- |
| `cli.ts` | Entry point of the scripts (`node tools/corpus/cli.ts templates\|coverage\|extract`). Installs the resolution hooks, then imports `main.ts`. |
| `extract.ts` | `pnpm corpus:extract --file <oracle_cards> --names <file>`: copies the named real cards into the golden corpus (`packages/cards/test/fixtures/corpus/golden.jsonl`), replacing an entry with the same oracle id. The owner runs it; tests use SYNTHETIC input. |
| `register.ts`, `ts-resolve-hooks.ts` | A Node `module.register` hook (Node built-ins only) that retries an extension-less relative import with `.ts` and `/index.ts`. The packages are written for a bundler (`./convert/index`); without the hook plain `node file.ts` cannot load `@commander-arena/cards`. Nothing else is changed, and it is not used by the packages or the web app. |
| `main.ts`, `args.ts` | The commands: arguments, input (file or download), reports, `--check`, `--update-baseline`, exit codes (0 ok, 1 coverage dropped, 2 bad input). |
| `read-cards.ts` | Streams card objects with constant memory from gzipped JSON Lines, plain JSON Lines or a JSON array, recognised by content. A malformed line is reported and skipped. |
| `download.ts` | The only network code: lists `/bulk-data`, streams `jsonl_download_uri` (D-048) to `.cache/corpus/`. Takes an injected `fetch` for tests. |
| `analyze.ts` | `parseStoredCard` then `importCard` from `@commander-arena/cards` for each card; keeps Commander-legal cards (`--all` keeps every card). |
| `coverage.ts`, `backlog.ts` | Supported shares (all, top 500, top 1,000 by `edhrecRank`), the breakdown by reason, and the ranked backlog: `analyzeTemplates` plus popularity weight (`1 / rank`, a small floor without a rank) and the "only blocker" subset. Pure functions. |
| `render-coverage.ts`, `render-backlog.ts`, `markdown.ts`, `baseline.ts` | The report files and the non-regression baseline (supported counts; a lower count in any group fails `--check`). |
| `synthetic.ts`, `fixture-files.ts` | SYNTHETIC cards and writers for the tests. |

Data flow: bulk file -> `read-cards` -> `parseStoredCard` -> `importCard` -> `CardRecord`s (small) and the unsupported `ImportedCard`s -> `buildBacklog` -> `reports/`. The import (about 0.6 ms per card) dominates the run time. The reports contain no timestamps, so two runs over the same file are identical. `tools` imports `@commander-arena/cards` through its public API only (`tools/package.json` depends on it as `workspace:*`); `pnpm lint:boundaries` scans `packages` and `apps` only, so no boundary rule changed. CI does not run `--check` yet: it needs the first real baseline.

## Layering (REAL)

Every cross-package import goes through the target's `src/index.ts`.

| Package | May import | May not import |
| --- | --- | --- |
| `engine` | itself, `zod` | Node built-ins, any other npm package, `cards`, `ai`, `apps/*` |
| `cards` | `engine` (public API) | `ai`, `apps/*` |
| `ai` | `engine` (public API) | Node built-ins, any npm package, `cards`, `apps/*` |
| `apps/web` | `engine`, `cards`, `ai` (public APIs) | package internals |

Libraries never import apps, and import cycles are forbidden everywhere. The layering and public-API rules apply to files under `packages/*/test` as well as `src`; the purity rules (no Node built-ins, npm allowlist) apply to `src/` only, so tests may import vitest and Node. How each row is enforced is in "How the boundaries are enforced" at the end.

## Engine design

Items are tagged REAL (built and tested) or PLANNED.

### State and API (REAL)

- `GameState` is plain, JSON-serializable data: no class instances, functions or cycles (`src/state/types.ts`). Seats are an ordered array; "opponent" is resolved through the rules (`opponentsOf`, `seatsInOrder`), never as `players[1]`. `createGame` accepts exactly two seats until M10 (multiplayer leaving-the-game rules); every other rule is written for any number.
- `GameState.modesChosenBySource` stores persistent modal choice history by object identity for abilities such as Kimoyo Beads (D-590); a zone change creates a new object with a fresh history.
- `Amount.lifeTotalOf` is evaluated by `rules/amounts.ts` at instruction resolution; `setLifeTotal` uses the same amount evaluator before sending any increase through the life-gain replacement pipeline (D-591).
- `CardFace.commanderTaxLife` and `rules/cast-cost.ts` represent a card that replaces command-zone tax mana with life. `getView` and the `payMana` decision show the separate life amount; the ordinary payment and cast event retain it through cancellation and resolution (D-605).
- Devotion reads are isolated in `rules/devotion.ts`, which uses copiable mana costs without importing the full amount evaluator; this lets layer 7a characteristic-defining toughness read devotion without creating a derive cycle (D-592).
- Zones: each seat owns library, hand, graveyard and command; battlefield, stack and exile are shared. Zone lists hold ObjectIds.
- Gift keeps the promised opponent on the spell and on a permanent that enters from it. Its shared effect module provides the card draw and tapped Fish gifts; spell target slots may be conditioned on either branch of the gift choice.
- Public API (`src/index.ts`):

```ts
createGame(config): { state, events }                  // stops at the first mulligan decision
applyAction(state, seat, action): { ok, state, events } | { ok: false, error }   // the only way to change state
getLegalActions(state, seat): Action[]                 // the pending decision's answers, if it is this seat's
legalActionsForDecision(decision): Action[]            // the same, from a decision alone (the AI and UI use this)
getView(state, seat): GameView                         // only what that seat may know
checkInvariants(state): string[]                       // structural consistency, for property tests
stateHash(value): string                               // deterministic fingerprint
```

- Object identity (CR 400.7): each card has a stable `CardId`; every zone change creates a new `ObjectId` and the old object ceases to exist. Targets, damage and attachments point at objects, so a creature that left and came back no longer matches an old target. Commander status belongs to the card.
- Derived characteristics: `rules/derive.ts` is the one function that computes power, toughness, types and abilities. It applies base values, then in layer 7c (CR 613.4c) the +1/+1 and -1/-1 counters and the `ContinuousEffect`s of `GameState.continuousEffects` (REAL since slice S3, see below); it also expands Cycling and Equip into their activated abilities. Since the layouts slice it reads the face that is up (`GameObject.face`) and, for a split card outside the stack, both halves combined (see "Multi-face layouts" below). Since slice S4a it applies layer 6 (keywords granted by static abilities, CR 613.1f) before layer 7c and adds the static "+N/+N" effects to 7c; it also reports the permanents attached to an object and the one it is attached to (`Derived.attachments`, `Derived.attachedTo`). The remaining layers (CR 613) arrive in M5 behind the same function (PLANNED). Speed (D-173): its result is kept per (state, object) by the identity of both, and so are `typeViewOf`, `countForSource` and `paymentSources`; what depends on less is kept on less (printed values per card face, keyword expansions and static modifiers per ability list, continuous effects grouped per effects list); `rules/printed-statics.ts` lets a scan for one kind of static ability skip `derive`. Nothing is global state that outlives its key (`WeakMap`s), and nothing mutates a state or an object in place, which is what makes the keys sound; `packages/engine/test/derive-cache-keys.test.ts` pins them and `derive-differential.test.ts` guards the results.
- Trigger matching: `rules/triggers.ts` turns events such as `spellCast` into candidate occurrences and matches them against derived triggered abilities. A `castSpell` trigger may filter by the caster's spell number this turn (`nth`) and by whether the active player is an opponent of the ability's current controller (`duringTurn: 'opponent'`); the existing per-seat cast count resets for every seat when each new turn begins, so this needs no extra state.
- Randomness comes only from a seeded xoshiro128** PRNG stored in state; a seed plus the action log reproduces a game exactly (REAL: `scenario-29-determinism`, the AI property tests and `replayGame`). There is no save, load or replay feature for players (D-165); `replayGame` stays as a test tool.
- Hidden information: `getView` lists only the viewer's own hand, shows counts for other hands and libraries, and includes the pending decision only for the deciding seat (REAL; audited by `packages/ai/test/hidden-info.test.ts`). `determinize(state, viewer, rng)` is REAL (`src/determinize.ts`, A31, D-161): the host hands an agent a sample of the real state with everything the viewer cannot know drawn again (`DecideContext.sample`, built by `runGame` and the web host when asked); search over it (MCTS) is v2.


### Amendments A1 to A6

The event pipeline (every change is proposed, run through replacement and prevention effects, committed and emitted), priority as a decision, casting as a transaction with a rewind snapshot, last-known information, mana objects that carry restrictions and immutable updates with structural sharing are specified in SPEC 17.1 (A1 to A6, D-001 to D-006) and are REAL. The code: `rules/zones.ts` (the zone-change pipeline and `LastKnownInfo`), `rules/cast.ts` and `rules/activate.ts` (the `CastingContext` and its snapshot), `mana/` (typed `ManaObject`, `planPayment`), `rules/priority.ts` and `rules/flow.ts` (the one pending decision).

### Combat (REAL)

- `rules/combat-removal.ts`: takes a creature out of the combat in progress (CR 506.4: regeneration, a change of controller).
- `rules/combat-legality.ts`: who may attack (untapped creature, not a battle, no defender, haste or not summoning sick), what can be attacked (players, planeswalkers, battles), who may block what (flying and reach, menace's two-blocker rule), and validation of whole declarations.
- `rules/combat.ts`: records attackers (tapping them unless vigilance) and blocks in `GameState.combat`; builds the damage plan for a step; validates a chosen division (CR 510.1e, 702.19b); deals damage simultaneously; remembers who had first strike when the first step began (CR 510.4).
- `rules/combat-flow.ts`: the turn-based action of each combat step, the step order inside combat (declare blockers and damage are skipped without attackers, CR 508.8), and the answers to `declareAttackers`, `declareBlockers` and `assignDamage`.
- `rules/damage.ts`: the one place damage is dealt, for spells and combat: life loss, marked damage with deathtouch, loyalty and defense counters, lifelink, commander damage (combat only). Since the prevention slice it first settles the prevention effects (CR 615) and, since D-191, in the order of `rules/damage-order.ts` (CR 616.1): the effects that apply (the shields of `rules/prevention.ts` and the static `preventDamageToThis`) are listed, applied one at a time and listed again, and when the order can change the result the affected player is asked (`chooseOption`, purpose `replacement`); prevented damage is reported as `damagePrevented` and never dealt. `dealDamageAsking` returns the question with nothing dealt; a resolving instruction (`rules/damage-effects.ts`, `rules/fight.ts`) and a combat damage step (`rules/combat-flow.ts`, `DamageResume`) run again with the answers; `dealDamage` is the default-order wrapper (the rider of a mana ability). Since D-221 the replacement effects of the creation of tokens (`rules/token-replacement.ts` `settleTokens`, CR 616.1) are ordered the same way, with the same question and the same replay (`ResolutionContext.damageAnswers`): `rules/token-batch.ts` `makeSettled` settles the tokens of one `createToken` or `createCopies` and makes them, `createTokens` is the default-order wrapper. Since D-192 a redirection (`rules/damage-redirect.ts`, CR 614.9) is one more effect of that order: settling can change the recipient and `dealDamageAsking` deals the damage to the one it leaves; `keepsDamage` (`rules/statics.ts`) is read in the cleanup step.
  `rules/life-gain.ts` uses the same answer stream for additive and multiplicative life-gain replacements. If their order changes the amount gained, `gainLife` returns a `chooseOption` replacement decision without committing the gain; the spell instruction or combat damage batch replays with the answer, so life gain can pause during lifelink without dealing damage twice (D-588).
- Declarations are validated, not enumerated (D-041); only real damage choices become a decision (D-042). `getView` exposes combat, keywords and a battle's protector.

### Engine rules by area (REAL)

The modules of `packages/engine/src/rules/` by area. The nodes a module runs are in `ast/types.ts` and `ast/features.ts`. Every new decision kind or event needs a case in the exhaustive handlers of the AI (`packages/ai/src/casual-agent.ts` and `legal.ts`) and the web (`apps/web/src/ui/decisions/`), which stop compiling until they are handled.

| Area | Modules (`src/rules/`) |
| --- | --- |
| Triggers, sacrifice, tokens, state triggers, delayed triggers | `triggers.ts`, `trigger-stack.ts`, `trigger-subject.ts`, `state-triggers.ts`, `later-triggers.ts`, `sacrifice.ts`, `sacrifice-choice.ts`, `tokens.ts`, `enter-token.ts` |
| Activated abilities, costs, Cycling, mana abilities | `activate*.ts`, `cast-cost.ts`, `cast-additional.ts`, `discard-cost.ts`, `exile-cost.ts`, `mana-abilities.ts`, `mana-engine.ts`, `mana-sources.ts`, `mana-triggers.ts` |
| Layers, statics, Auras, Equipment, flicker, copies, legend rule | `derive*.ts`, `continuous.ts`, `statics.ts`, `static-subject.ts`, `attach.ts`, `aura-entry.ts`, `copiable.ts`, `legend-rule.ts`, `lost-abilities.ts` |
| Casting variants | `alt-costs.ts`, `kicks.ts`, `cast-free.ts`, `cast-exiled.ts`, `cascade.ts`, `copy-spell.ts`, `madness.ts`, `miracle.ts`, `time-counter.ts`, `impulse.ts` |
| X, modes, targets, choices as a permanent enters or an effect resolves | `x-value.ts`, `modes.ts`, `target-choice.ts`, `chosen.ts`, `pay-options.ts`, `pay-unless.ts`, `choose-one.ts`, `vote.ts`, `vote-answer.ts`, `ring.ts`, `effects.ts`, `stack.ts` |
| Library, hand, graveyard | `search.ts`, `share-type.ts`, `arrange.ts`, `look-take.ts`, `reveal-top.ts`, `reveal-until.ts`, `draw.ts`, `mill.ts`, `roll-die.ts` |
| Combat and restrictions | `combat*.ts`, `damage.ts`, `attack-tax.ts`, `block-tax.ts`, `restrictions.ts`, `reselect-attack.ts`, `crew.ts`, `fight.ts` |
| Prevention and replacement | `prevention.ts`, `damage-order.ts`, `damage-redirect.ts`, `damage-modifier.ts`, `damage-order-text.ts`, `damage-effects.ts`, `die-replacement.ts`, `enters.ts`, `life-gain.ts`, `regenerate.ts` |
| Layouts and Sagas | `layouts.ts`, `transform.ts`, `saga.ts` |
| Keywords | `derive-keywords.ts`, `keywords.ts`, `split-second.ts` |
| Player state and designations | `monarch.ts`, `ring-bearer.ts`, `inherent.ts`, `player-protection.ts`, `proliferate.ts`, `mana-outcomes.ts` |
| Planeswalkers and emblems | `loyalty.ts`, `emblem.ts`, `activate-legality.ts`, `empower.ts`, `defending.ts`, `combat-removal.ts` |

### Decisions and actions (REAL)

The pending decision kinds (`src/state/decisions.ts`) are priority, mulligan, mulliganBottom, targets, payMana, choosePayOptions, discard, commanderZone, declareAttackers, declareBlockers, assignDamage, choosePermanent, orderTriggers, confirmOptional, chooseCards, arrangeCards, chooseOption, chooseX and chooseModes; each is answered by an action of the same name or purpose (`Action` in `src/state/actions.ts`), and the priority decision also lists the options cast, activate, play a land, special actions and pass. Concede is a priority option for the human and an `Agent` choice for the AI (A28). `ManualAdjust` is an ordinary action kind that goes through `applyAction`, is logged as manual and replays exactly (A25, D-025). When a decision kind is added, the exhaustive handlers of the AI and the web stop compiling until they handle it. `ChooseCardsDecision` may carry the constraints of a whole answer, `totalManaValue` (D-230) and `shareLandType` (D-262), which `applyAction` and the listed actions check with the same function; `ManaSpent.snow` (D-260) is the snow part of the mana spent to cast a spell. History of when each kind arrived: D-041, D-042, D-060, D-091, D-100, D-103, D-105.

### Card ability model (REAL)

Card behavior is a typed ability AST built from effect primitives, selectors, conditions, costs and durations, executed by one interpreter. The Oracle parser produces the AST; the hand-written route is the engine's real-card fixtures (`createFixtureRegistry`, a fixture is used only when it agrees with the real card), checked by `validateCard`; there is no code registry of overrides (D-067) and no community definitions (removed in D-167). The AST types are `src/ast/types.ts`, the support check is `validateCard` with `SUPPORTED_FEATURES` (A7, D-007): it rejects a card marked supported that uses anything outside the list, so "supported" is a runtime guarantee. A card is supported only when every ability lowers and validates; text the parser does not read is reported with the stop position and the closest rule, never half-executed.

## Parser pipeline (REAL)

```text
Oracle text (per face)
  | normalizeOracleText + splitAbilities                     parser/normalize.ts (unchanged)
  v
ability line
  | segment(text, face)                                      parser/segment.ts: skeleton from punctuation, no vocabulary
  v
AbilitySkeleton { head: triggered | activated | modal | replacement | other, slots as spans }
  | parseAbility: phrase rules per family, by slot           parser/parse-ability.ts, parser/sentence.ts, parser/rules/
  v
IR (IrAbility: nouns, clauses, costs, keywords; every node has a span and a rule id)    parser/ir/types.ts
  | bind()                                                   parser/ir/bind.ts: targets t1, t2, ...; it, that creature, those cards
  v
bound IR                          or  LineFailure { reason: 'unboundReference', reference }
  | lower(): one lowering per IR head, each declaring needs  parser/lower/
  v
Ability[] | SpellParts            or  LineFailure { reason: 'notRunnable', needs: FeatureRef[] }
  | finishSpell (spell lines of a face joined), validateCard (engine, the last gate)
  v
support status + UnparsedAbility v2 per dropped ability     parser/diagnostics.ts
```

`compileLine` (parser/compile.ts) runs one line through the whole pipeline and returns either the abilities or a `LineFailure` with a `reason`: `unrecognised` (no rule read the text; `slot` is the family being filled, `recognised` the rules that matched before the stop), `notRunnable` (read, but the engine lacks something; `needs` names it) or `unboundReference`. `parseFaceText` and `matchAbility` are façades over it with the signatures the first parser had; `UnparsedAbility` keeps its schema 1 fields and gains the optional v2 ones (SPEC A30).

| Path under `packages/cards/src/convert/parser/` | Role |
| --- | --- |
| `combinators.ts` | The parsing kit (the only parsing tool, D-069): `literal`, `pattern`, `sequence`, `choice`, `many`, `optional`, `chain`, `satisfy`, `separatedBy1`, `named` (rule name for diagnostics), `inFamily` (slot name), `refuseAt`, `runDetailed` (reads a region of a line, reports progress, rule, slot, matches). Offsets are absolute in the line. |
| `segment.ts` | Heads and slots: trigger word, trigger, intervening if, costs, restrictions, body sentences, modal header and bullets. A Saga's chapter line (`I, II — ...`, CR 714.2) is a triggered skeleton with `chapter: true`, the numerals as the trigger and no trigger word. |
| `roman.ts` | The Roman numerals of chapter symbols (`romanValue`, `romanOf`), the `CHAPTER_PREFIX` the segmenter uses and `chapterNumbers` (also used by `convert/face.ts` for `finalChapter` and by `import-card.ts`). |
| `rules/registry.ts` | `defineRule({ id, family, leading, parse, examples, rejects, cites })`, `buildRuleSet`, `family()` (try the rules of a family that can start here, in registration order), `node()`. |
| `rules/<family>/` | The phrase rules: `keyword/` (`keyword.line`), `replacement/` (`replacement.enters-tapped`, `replacement.enters-with-counters`), `cost/` (`cost.tap`), `effect/` (damage, destroy, exile, return, counter, tap, untap, add-mana, player, draw, shuffle), `noun/` (any-target, player, target-spell, graveyard cards, permanents), `amount/` (number, X, article). `rules/index.ts` is the registration order. |
| `ir/types.ts` | The IR, with the D-063 amendments: `IrCondition` has `and`/`or`/`not`, `IrFilter` has `anyOf`. |
| `ir/bind.ts` | The binding pass. Nothing is guessed: a pronoun with no compatible antecedent fails with `unboundReference`. Since D-176 a "that creature" at the start of a spell's line is bound to the last single target of the line before, and `ir/fold-token.ts` folds "It has \"...\"" into the token the sentence before creates. |
| `lower/` | `features.ts` (`isRunnable`, `missingFeatures` over `SUPPORTED_FEATURES`), `nouns.ts` (selectors, target declarations, filters including `anyOf`), `amounts.ts`, `effects.ts` (one lowering per clause verb), `abilities.ts` (keyword, replacement, mana ability, spell text), `tokens.ts` and `late.ts` (the abilities a token has in quotes: lowered with the lowerings of triggered and activated abilities, which `index.ts` registers because the clause lowerings cannot import them, D-176), `korvold.ts`, `index.ts` (`lower`, `finishSpell`, `DECLARED_NEEDS`). |
| `compile.ts`, `diagnostics.ts`, `parse-face.ts`, `match.ts` | The pipeline for one line, the v2 diagnostic builder, and the two façades. |

Engine side: `SUPPORTED_FEATURES` has the dimensions of D-068 (`costKinds`, `selectorKinds`, `conditionKinds`, `durationKinds`, `staticKinds`, `tokenKinds`, `amountKinds`), each filled only with what the engine runs; `FeatureRef` (`effect:draw`, `keyword:flash`, `manaCost:tap`, `selector:anyOf`, ...), `isFeatureSupported`, `isKnownFeature` and `FEATURE_VALUES` are in `ast/features.ts`. `ObjectFilter.anyOf` is a disjunction of filters ("artifact or enchantment"); `zone` and `stackKind` stay on the outer filter.

Meta tests over the registry (`packages/cards/test/parser-registry.test.ts`): every `examples` line is read by exactly one rule of its family, every `rejects` line is refused by its rule, every rule is reached by the full pipeline. The golden corpus (`packages/cards/test/fixtures/corpus/`, `golden.test.ts`) is the CI coverage gate: `golden.expected.json` records each card's status, diagnostics and an AST hash, with training and hold-out coverage reported separately; `pnpm corpus:extract` adds real cards to it. `PARSER_VERSION` (`packages/cards/src/version.ts`, one comment per version) invalidates cached support reports when the parser changes.

Rule families: trigger, condition, static, token, activated-ability, cost, restriction, duration, amount, keyword, modal, noun and effect rules, with their lowerings in `lower/`, and ability-word stripping in `normalize.ts` (CR 207.2c). Not built: the code overrides registry of D-067 (`defineOverride`), `templateOf` refined by slot, the engine-gaps table in `reports/backlog.md`.

## Worker and UI data flow

```text
  apps/web main thread                          Web Worker
  ---------------------                         ---------------------------------------
  React + Zustand                               engine: owns the authoritative GameState
  shouldStop(view, settings)  (A18)             ai: agents, receive views only
  decision UI handlers        --- Comlink --->  watchdog: AI time budget, safe fallback (A28)
  renders views and events    <-- views, ---    applyAction(state, seat, action)
                                  events,
                                  pending decision
```

- The UI talks to the Worker over Comlink RPC. The engine and the AI run inside the Worker, so the UI never freezes while the AI thinks.
- The host builds the opponent from `NewGameOptions.ai` (D-164): `'normal'` is `HeuristicAgent`, `'casual'` or an absent field is `CasualAgent`; the page always sends the field (the menu sends `'normal'`, `?autostart` sends `casual` unless `&ai=` says otherwise). The Worker's clock is `performance.now`, passed as `ctx.now` with a budget of 5000 ms (`DEFAULT_BUDGET_MS`, D-172); `HeuristicAgent` reads time only through `ctx.now` (its searches stop at a budget of work, the same on every device; the clock stops a search at 60% of the time budget, and the turn planner's look at one more turn at 110%, only as a safety cutoff on a slow device), and the A28 watchdog replaces an answer that arrives more than 2500 ms past the budget (`DEFAULT_MARGIN_MS`). The host adds no delay after an AI action; the page animates from the steps of the snapshot. There is one level and no difficulty setting (the Easy level was removed, D-168).
- Parallel play-outs (issue 653, step 2c): a planning is the longest thing the AI does and its play-outs are independent, so the game Worker owns a `WorkerPlayOutPool` (`game/play-out-pool.ts`) of 2 to 4 child Workers (`game/play-out.worker.ts`, started when a game against the heuristic opponent begins; one fewer than `navigator.hardwareConcurrency`, none below 3; `?workers=<n>` on the page sets the number, `0` or `1` turns the pool off) and gives it to the AI in each decision's `ctx.playOuts`. A worker is sent a planning's states once, plays one line on one scenario at a time with the planner's own code and answers a trace (play-outs that share a memo, one scenario and lines that start alike, stay on one worker while they can); the planner settles traces in its own order, so a game is the same with the pool, without it and with a pool that fails (the planner then plays on its own thread). The benchmark and the arena give no pool and stay on one thread. A worker finishes the play-out it is on when a planning ends, and an answer later than 30 s gives the worker up.
- "Opponent is thinking" (D-174) needs no protocol field. The Worker answers once, after the human's action and the AI's whole run, so the page infers the AI from its own request: `store.ts` sets `AppState.hostCall` (a sequence number, null when none) around every `client.act` (the player's action and the autopilot's passes, not undo or `newGame`), `ui/decisions/thinking.ts` (`watchThinking`, `useOpponentThinking`, `THINKING_DELAY_MS` = 400) turns a call that has lasted that long into a flag with a plain `setTimeout`, `DecisionLayer` passes it to `ActionBar`, and the always-present, one-line `.dec-thinking` status (polite live region) shows the words, so the dock does not change size. Inexact when the request is slow for another reason (a big board's engine step on a slow machine) and absent while a modal question is on screen (the dock is hidden then). The test seam `?autostart=...&aidelay=<ms>` (`game/slow-opponent.ts`, wired in `main.tsx`; capped at 10 s, only read with `?autostart`) wraps the client on the page's side and holds back each answer in which the AI acted.
- Only a `Snapshot` crosses the boundary (`apps/web/src/game/protocol.ts`): the human's `getView`, the steps applied since the last snapshot with their events, new log lines built in the Worker, and the AI fallback count. The AI's whole turn arrives in one snapshot; animation (M8) will replay the steps. The UI never receives `GameState`, and sends only `Action` values, which the Worker validates through `applyAction`.
- Combat animations (D-226, D-228) are a page-side layer over the snapshot's steps, with no protocol field: `ui/board/combat-effects.ts` (pure: `combatBeats` orders what happened, `scheduleBeats` staggers, caps and scales it by the speed), `combat-fx-play.ts` and `combat-fx-dom.ts` (Web Animations API on elements added to the `.fx-layer` of `CombatEffects.tsx`, which subscribes to the store and sees a snapshot before React redraws, so a dying tile is copied first), and the two settings in `ui/panels/animations.ts` (`Combat animations`, `Animation speed`). The one coupling to the game's pace is `policy/animation-gate.ts`: the layer holds the gate while effects play and the store's autopilot awaits it before each automatic pass (an option of `createAppStore`, passed by `main.tsx`; capped at 2.5 s, released by any click, undo, cancel or new game). The host, the Worker, the engine and the AI never see it.
- The card picker (`chooseCards`, M5): a dock panel with one row per distinct card (equal names are one row with a count: name, mana cost, type line, rules text) and a list of the picks in order. The clickable set is `decision.legal`; clicking toggles, and the order of the clicks is the order sent, because a search puts the first card found at the first destination (the decision's `prompt` says so in words). A search may answer with nothing (the button reads "Find nothing"); a discard needs exactly its count. A library search lists `view.pendingCards`, which the engine fills only for the deciding viewer, and the UI reads it only while `view.pending` is that viewer's own `chooseCards`; a discard lists the viewer's hand filtered by `legal`, and the hand cards on the board are clickable too. The seat that is not choosing gets a status line from `view.waitingOn` ("Opponent is searching their library (Name)."), never a card. The answer clears the undo history like `choosePermanents`, and `shouldStop` always stops for it.
- The auto-pass policy `shouldStop(view, settings)` lives in `apps/web`, not in the engine, and every auto-pass is recorded as an ordinary pass action so replays stay exact (A18, D-018). It stops for an opponent's spell on the stack (`stopForOpponentSpells`, D-199); the preview panel shows the top of the stack when nothing is hovered (`previewChoice` in `ui/board/resolve.ts`), and `describeEvents` leads what a resolution did with a "<spell> resolves." line.
- AI reports (issue 627): `GameClient.gameRecord` returns the seed, the settings, how each deck was built (`NewGameOptions.replayDecks`: a precon id, a hidden deck id, or the list with the card data the repository lacks) and the action log; `game/ai-report.ts` writes the record in the format of `packages/cards/src/replay/ai-report.ts` into a prefilled issue, and `tools/ai/report.ts` replays it through `applyAction`.
- The Worker enforces the AI time budget; a decision that overruns by a configurable margin is replaced with a safe fallback and logged (A28).
- The card cache and saved decks are stored in IndexedDB (SPEC 4.1, from M4). Where that code runs relative to the Worker is not decided yet. The static site has no backend.

### Decision UI (REAL)

`apps/web/src/ui/decisions/` builds one model per decision kind (`model.ts`, checked by `handleDecision`, so a new kind stops the typecheck until it has a handler) and one view per kind (`Overlays.tsx` for modal dialogs and dock panels, with `PermanentPanel.tsx`, `OrderPanel.tsx`, `Chooser.tsx`, `Dialog.tsx`, `cards-picker.ts` and `ArrangePanel.tsx` split out). The pattern: board highlights for what can be picked, a dock panel for the rest, a primary button that sends the answer action, and wording for every event in `game/describe.ts`.md`, "Web, view and AI".

- **Auto-pass.** `shouldStop` stops for every decision except priority; the autopilot only sends `pass` and, with manual mana off, `payAuto`, so every question waits for the player whatever Full Control or the stop settings say.
- **Undo (D-050).** An answer that only reorders or retries inside a priority window can be taken back; an answer to a question asked while an object resolves closes the undo window (comment in `game/host.ts`).
- **Manual mana.** Which sources ask for a color comes from `PayManaDecision.manaSources[].colors`, not from rules text; `clickSource` in `ui/decisions/payment.ts` decides a click.
- **Log and stack.** `game/describe.ts` words events from the decision before the action, never by looking `event.source` up; a stack ability is named after its source and falls back to last-known names.

### Deterministic end-to-end tests (`data-settled`)

A seed fixes the engine and the AI, but a script that clicks "whatever is clickable" every 60 ms sends different actions depending on timing: a click made while the autopilot is passing seizes it and is queued until it stops (`store.ts` `act`), so it can pass a main phase the script meant to play a land in, and the seed reaches another game (found by comparing the logs of stressed runs: same seed, the opponent's second land played or not; no AI fallback was counted in any of them). `AppState.busy` (a request or the autopilot in flight) is shown as `data-settled` and `data-revision` on the `.app` root, and every e2e loop that relies on a seed waits for `settled(page)` (`e2e/harness/settle.ts`) before it reads the page and clicks once. The AI watchdog (A28, `host.ts`) was not involved in the observed divergence and keeps its production defaults.

## Testing strategy

| Layer | Status | Notes |
| --- | --- | --- |
| Vitest projects, one per package, app and `tools` (`vitest.config.ts`) | REAL | Tests sit in each package's `test/` directory; tool tests sit beside their tool. |
| Boundary tests (`tools/boundaries/boundaries.test.ts`) | REAL | See the last section. |
| Nondeterminism lint tests (`tools/lint/nondeterminism.test.ts`) | REAL | See the last section. |
| Version and smoke tests in each package | REAL | They prove only that the packages load. |
| Scenario DSL (`src/testing/`, A12, D-012) | REAL | A test-only entry, `@commander-arena/engine/testing`, kept out of the public API by the `engine-testing-entry-tests-only` boundary rule. A builder that writes a precise starting state and a driver whose every verb goes through `applyAction` (`g.act(0).cast('Lightning Bolt', { targets })`, `g.passAll()`, `g.expect.zone(...)`). Checks invariants after each verb and that `applyAction` does not mutate its input. |
| The scenario tests of SPEC 12 | REAL | `packages/engine/test/scenario-NN-*.test.ts` hold the numbered ones that exist (1 to 25 and 29); the slices add `scenario-xx-*.test.ts` files, one per mechanic. Each was mutation-checked for engine rules (D-126). |
| Property tests with fast-check on random games | REAL | `packages/ai/test/properties.test.ts`: invariants after every action, `getLegalActions` agrees with `applyAction`, determinism, replay equals original, JSON round trip. |
| Complete games and soaks | REAL | `packages/ai/test/*-games.test.ts` play whole games per feature and deck style; a soak test plays 20 games by default, `pnpm test:soak` 100, and the manual `Soak` workflow 500 (D-126, D-132). |
| Parser tests and the golden corpus | REAL | Rule meta tests (`parser-registry.test.ts`), grammar tests (`convert-grammar-*.test.ts`) and `golden.test.ts` with `golden.expected.json` (AST snapshots; `coverage.yml` fails when supported counts drop, D-090). |
| Playwright end-to-end | REAL | `apps/web/e2e/*.e2e.ts` (`pnpm e2e`; Chromium needed). Seeded games are made deterministic by `data-settled` (below). |
| Performance budgets | PLANNED (M9) | `applyAction` under 5 ms, `getLegalActions` under 20 ms, AI decisions within 5 s, 6.5 s for a planning that looks a turn further (D-172, issue 653); no budget test exists yet. |
| CI | REAL | The quick `ci.yml` (typecheck, lint, build, unit tests without the soaks and browser tests); the complete suite is the owner-side nightly routine, and `full.yml` and `soak.yml` are manual (D-132). |

## How the boundaries are enforced (REAL)

Four mechanisms, all run by CI (`pnpm typecheck`, `pnpm lint`, `pnpm test`):

1. **Compiler settings.** `packages/engine/tsconfig.json` and `packages/ai/tsconfig.json` set `lib: ["ES2023"]` and `types: []` and include only `src`. DOM, timer and Node globals do not type-check there. `tsconfig.test.json` adds Node types for tests. `packages/cards` uses ES2023 plus DOM and Node types; `apps/web` uses ES2023, DOM and Vite client types. All extend `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
2. **dependency-cruiser** (`pnpm lint:boundaries`, part of `pnpm lint`; scans `packages` and `apps`). `.dependency-cruiser.cjs` loads its rules from `tools/boundaries/rules.cjs` and sets `tsPreCompilationDeps: true`, so type-only imports count.

   | Rule | Forbids |
   | --- | --- |
   | `engine-no-other-packages` | engine importing `cards`, `ai` or `apps/*` |
   | `engine-no-node-builtins` | engine importing Node built-ins |
   | `engine-npm-allowlist` | engine importing any npm package except `zod` |
   | `ai-only-engine` | ai importing `cards` or `apps/*` |
   | `ai-no-node-builtins` | ai importing Node built-ins |
   | `ai-npm-allowlist` | ai importing any npm package |
   | `cards-no-ai-or-web` | cards importing `ai` or `apps/*` |
   | `packages-no-apps` | any package importing `apps/*` |
   | `public-api-only-from-packages` | a package importing another package's files other than `src/index.ts` |
   | `public-api-only-from-web` | the web app importing package files other than `src/index.ts` |
   | `no-circular` | import cycles |
   | `not-to-unresolvable` | imports that do not resolve |

3. **Biome plugin** `tools/lint/no-nondeterminism.grit`, attached by `overrides` in `biome.json` to `packages/engine/src/**` and `packages/ai/src/**` only (not tests). It bans `Math.random`, `Date.now`, `new Date`, `performance.now`, `localeCompare` and `toLocaleString` (D-031).
4. **Tests that prove the above.** `tools/boundaries/boundaries.test.ts` builds a throwaway pnpm-style monorepo per case, runs dependency-cruiser with the real rules and asserts which rules fire. A meta test fails when a rule has no case, and a guard fails when a cruise scans no TypeScript file (D-030, D-033). `tools/lint/nondeterminism.test.ts` reads the real `overrides` from `biome.json`, so it fails if the scoping drifts.

**Not enforced by tooling today:** "no card-name special cases in engine code" (convention, checked in review) and "the AI sees only views" (it will follow from the API shape once `getView` exists).



## The game screen: one board with floating panels

```
.game (flex row)
  .game-main            DecisionLayer > Board (strips, rows, hand)
  .pnl-tracker          top left: the turn, priority and the previous, current and next step (TurnTracker)
  .turn-panel           right edge, scrolls: .game-dock-slot, StackPanel
  .board-preview        floats at the left edge, only while a card is read (PreviewPanel)
  .log-toggle, .settings-toggle   bottom left; open .log-dialog and .settings-dialog (LogDock, SettingsDock)
```

- **No columns.** The board takes the whole width; the turn box, the turn panel, the preview, the log and the settings float over it (`styles.css`). The turn box and the panel start level with the opponent's battlefield; the panel grows down to the bottom of the screen. Closed, the log stays in the page, out of sight, as a live region.
- **The dock is portaled.** `DecisionLayer` owns the decision and builds the dock (`.dec-dock`: the panels of the decision, then `ActionBar`); `Game` owns the slot in the turn panel (`DockSlotContext`, `ui/decisions/dock-slot.ts`) and `createPortal` draws the dock there, above the stack. A modal overlay and the toast stay in the layer. No provider (a render test): the dock is drawn in the layer.
- **The preview.** It shows the hovered card; any action of the player (and a tap on it) closes it; it lets the pointer through except for a reveal and the card on top of the stack.
- **Arrows.** `StackArrows` reads the boxes from the DOM; `facingEdge` starts an arrow at the item's edge that faces the target.

## Real precons and the one rule for starting a game

- **Snapshot format (REAL).** `packages/cards/src/precon/snapshot.ts`: `PreconSnapshot` (id, name, blurb, `source`, the decklist as given, the cards), `parsePreconSnapshot` (zod, strict; says what is wrong in one sentence), `serializePreconSnapshot` (fixed key order, cards sorted by name, no timestamp), `toSnapshotCard` and `fromSnapshotCard` (`fetchedAt` is not stored and reads back as 0).
- **Tool (REAL).** `tools/precon` (`pnpm precon:snapshot`, `docs/CORPUS.md`): bulk file and decklist in, `apps/web/src/precons/snapshots/<id>.json` out. Names are matched by the code of `tools/corpus/decks.ts`.
- **Loader (REAL).** `apps/web/src/precons/`: `snapshots.ts` (eager `import.meta.glob`, `loadSnapshots` skips and reports a bad file, a wrong file name or a repeated id, `PreconInfo` for the menu), `snapshot-client.ts` (a `ScryfallClient` over the snapshot's cards: full name, face name, front face, never fuzzy), `build.ts` (`buildPreconDeck`: the import service over that client, then `checkPlayable`; `createPrecons` memoises `prepare(id)` and lists the precons), `start.ts` (`startOptionsFor`: ids to `NewGameOptions` for the menu and `?autostart=`; hidden ids only with `allowHidden`). `ui/precons-context.tsx` provides it (no provider means nothing installed). `createImportEnvironment` also returns `serviceFor(client)`, the same service over another card source.
- **The rule (REAL).** `import/deck.ts` `checkPlayable` / `unplayableReason` / `toDeckConfig`: names resolved, a commander, `validateDeck` ok, every card supported (D-056), and a `Companion` section checked by `validateDeck` and carried as `DeckConfig.companion` (the engine keeps it outside the game in `SeatState.companion`; the special action `bringCompanion` puts it in the hand). Paths that start a game: the menu (`ui/screens/menu-model.ts` `startFromForm`, which also starts a saved deck: the import screen has no play button since D-226) and `?autostart=` (`main.tsx`). The one exception is a hidden test deck id in `?autostart=` (`game/precons.ts` `HIDDEN_DECKS`, `isHiddenDeckId`); `GameHost` refuses any other id that comes without prepared cards.
- **Worker protocol.** `NewGameOptions.aiCards` (the opponent's prepared deck) next to `humanCards`; a real precon id only labels it.
- **UI.** The menu "Quick start" lists the installed precons for both seats or says "No precon is installed yet" (Start disabled); the import screen's example is the first precon's real list (no button without one) and its opponent list is the installed precons.

## Meld: object model and data flow

- State: a melded permanent is one `GameObject` with `meldedWith` (the second card); every other zone holds two ordinary cards. `rules/melded.ts` is the only place that reads the pair; `test/meld-reads.test.ts` guards it. When the permanent leaves, `moveOne` makes two objects and the event of the second card carries `component`, so a trigger fires once.
- Cards: a meld card has the layout `meld`; its `CardDefinition` carries the combined face as `faces[1]` and `meld.partner`. The combined face is a card of its own that no deck names, so the data flow carries it with the pair: `resolveNames` fetches it in a second pass (`ResolveResult.related`), `relatedLookup` turns it into the `MeldLookup` that `importCard` takes, the import service reports it as `ImportReport.meldFaces`, the deck-support issue and the golden corpus store it as a `related` record, and the tools of `tools/corpus` and `tools/precon` read it with the pair. A meld card whose result is missing is unsupported with a reason (`layout "meld"`), and its support is never cached. The Scryfall component names it reads (`meld_part`, `meld_result`) are UNVERIFIED.
- View and web: `ObjectView.meld` carries the two cards' faces and the mana value; the board draws the combined face, the preview lists the two cards, the log has one line for the meld and one for each card that leaves.

## Soulbond and pairing: object model and data flow

- State: a pair is `GameObject.paired { with, by }` on both creatures; `rules/pairing.ts` is the only place that reads it (`test/paired-reads.test.ts` guards it; `rules/pairing-sba.ts`, `invariants.ts` and `testing/assemble.ts` own the field too). `partnerOf` is what derive, conditions and the view read (the pair stands and both are on the battlefield; the view also says `pairedPhasedOut` when the pair stands with a member phased out); `linkedPartnerOf` decides "unpaired" and keeps a pair across phasing. The state-based action `endBrokenPairs` clears a pair that no longer stands and is the one place that reads `derive` for "still a creature".
- Abilities: `derive-keywords.ts` expands the keyword into the two abilities of `soulbond-abilities.ts`; `soulbond.ts` reads their intervening "if" and runs `pair`, which asks a `choosePermanent` of purpose `soulbond` (answered through `answerResolutionChoice`, no new action kind).
- Where `paired` may stand (D-287): the condition reads the pair of the permanent on the battlefield now and no last-known information, so it is exact only as the "as long as" condition of a static ability. The parser reads it there alone (`LowerContext.staticCondition`) and `validateCard` refuses it anywhere else (`checkPairedPlacement`: a triggered, activated, mana or replacement ability, the payload and a graveyard static ability, the alternative and additional costs of a face, a spell), because the source of a triggered ability may have left when the intervening "if" is checked again (CR 400.7, 603.4, 608.2h).
- Look-back: `simultaneous.ts` records the last-known information of the permanents of one event before the first moves (`lkiRecorded` on the move), so a granted dies ability fires for every creature that dies together.
- View and web: `ObjectView.pairedWith` (never a stale link); the board flag, the preview fact and the words of the decision live in `apps/web` (`permanents-soulbond.ts`); the agents answer through `casual-soulbond.ts`.

## Manifest and face-down permanents: object model and data flow (REAL)

- State: a face-down permanent is the same `GameObject` as its card with `faceDown { by, n }`; `rules/face-down.ts` is the only place that reads the field (`test/face-down-reads.test.ts` guards it; `invariants.ts` and the scenario builder own it too). Layer 1b is one line of `copiableValues`: everything that reads characteristics sees a nameless 2/2, so what can name the card is only code that reads the card behind the object (the view, the log of the web, `determinize`, the notes the host sends), which ask `faceDownLabel` and `isFaceDown` and are covered by the two-world audit.
- Entering: `moveObject` with `entersFaceDown` creates the object face down before any enters rule reads the card (CR 708.3) and emits a `zoneChanged` with `card: null` and `manifested`. Leaving is the ordinary zone change: the new object is face up and the events name the card (CR 708.9).
- Turning up: a special action like Suspend and Foretell (a priority option, an action, a `payMana` decision of purpose `turnFaceUp`); the object is patched, not moved.
- View and agents: `ObjectView.faceDown`, `faceDownBy`, and for the controller `hiddenFace`, `turnFaceUpCost`, `ifFaceUp`; an agent sees only this, so it cannot peek; `determinize` deals the cards of other controllers' face-down permanents again.
- Web: the page draws a card back with the Manifest token's picture (looked up at run time, never stored), the preview draws the real card for the controller, and the log of the host words the events without naming a hidden card.


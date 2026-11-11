# Card support playbook

The procedure for teaching the game a card it cannot run yet (SPEC 8.3, D-089 and later). Follow it whenever the owner says something like "add support for <card>" or "work the backlog", or points at a GitHub issue that asks for a card. There is no request pipeline (D-166): the cards to work on come from the owner or from issues. The SPEC's rules for the loop are at the end; the lessons learned so far are after them.

## Where the inputs come from

| Input | Made by | Notes |
| --- | --- | --- |
| Card names | The owner, or a GitHub issue | The card's Oracle text and rulings come from Scryfall (owner-side when the sandbox blocks it). What blocks it (`stoppedAt`, `closestRule`, `reason`, `needs` of every unparsed ability) is shown by "Why unsupported?" on the import screen and grouped in `reports/backlog.md`. |
| `reports/coverage.md`, `reports/backlog.md`, `reports/templates.json` | `pnpm coverage:cards --download` | Real numbers. Needs Scryfall's bulk file: the owner runs it on a local machine (the cloud sandbox blocks Scryfall, `docs/CORPUS.md`). |
| `reports/template-replay.md` | `pnpm corpus:replay` | Runs offline: replays the real example line of each of the 1,000 heaviest templates in `templates.json` through today's parser. An ability-level estimate, never a coverage number. Use it to choose the next grammar work between two owner runs. |
| `packages/cards/test/fixtures/corpus/golden.jsonl` | `pnpm corpus:extract --names <file>` (owner) | Real Oracle text of the curated cards; the AST snapshot is `golden.expected.json`. |

Never invent card text, rulings or numbers. A card whose text you could not fetch is researched by the owner's run or left for later, and the docs say so.

## The procedure

1. **Intake.** Read the owner's message or the GitHub issue and list the cards. Get each card's Oracle text and what blocks it (see the table above; never invent either). Group the cards by missing capability (`closestRule`, `needs`, the shape of `stoppedAt`) so one change resolves several. A card already supported by the current `PARSER_VERSION` goes straight to step 9.
2. **Research.**
   - The card and its rulings: from the owner or the issue (text) and Scryfall (rulings; owner-side when the sandbox blocks it).
   - Every relevant CR rule: `pnpm rule <number>` and `pnpm rule --search <words>`. Never cite a rule from memory (see the lessons).
   - `docs/MECHANICS.md` (what exists: one section per engine slice with its AST nodes and "What the parser must produce", and an index of the parser stages), `docs/RULES_COVERAGE.md`, `docs/ROADMAP.md` (known limitations: the gap may already be described there).
   - The applied Update Bulletins in `docs/rules/RULES_VERSION.md`.
3. **Diagnose** at the lowest level that fixes it correctly:
   - **T, template.** The engine runs it (`SUPPORTED_FEATURES` lists every feature the lowering needs) but no phrase rule reads the wording. Add or extend a phrase rule in `packages/cards/src/convert/parser/rules/<family>/` with `examples` (real lines from the reports), `rejects` (near misses) and `cites`; lower it in `parser/lower/`, declaring its `needs`. A diagnostic with `reason: 'unrecognised'` is usually T.
   - **P, primitive.** A new effect, selector, condition, cost or duration in the engine's AST (`packages/engine/src/ast/`), run in `rules/`, listed in `SUPPORTED_FEATURES`, with scenario tests. `reason: 'notRunnable'` with `needs` names it.
   - **K, keyword.** A keyword ability or action implemented once, generically, after its CR rule (keyword abilities expand in `derive`, `rules/derive-keywords.ts`; actions are effects).
   - **S, subsystem.** New engine machinery: a layout, face-down permanents, phasing, day and night, the monarch, voting, extra turns, control of another player, a new `PendingDecision` kind that changes existing flows.
   - **O, one-off.** Text no general rule would reuse. There is no per-card route (the community definitions were removed, D-167): the card stays unsupported, and the reason goes in the report of step 10. Do not write card-specific code or data; if the text looks like a shape other cards share, it is T or P after all.
4. **Approval gate for S.** Write `docs/proposals/<mechanic>.md` (the rules, the engine changes, the risks, the planned tests, the cards it unlocks by the backlog's counts) and ask the owner before building it. Go on with the other cards meanwhile. A slice that reuses an existing machinery for a new case (D-089 reused the target decision for triggers) is P, not S; record it as a `D-` entry.
5. **Measure the impact.** With the planned change, run `pnpm corpus:replay` (offline) and, owner-side, `pnpm coverage:cards --file <bulk>`: which cards become supported, which supported cards change AST. Prefer the general solution that unlocks the most cards correctly.
6. **Write the tests first.**
   - Engine: scenario tests through `applyAction` with the DSL (`packages/engine/src/testing`), one per relevant ruling and CR rule, with layers, replacement effects and stack timing where they matter. SYNTHETIC fixtures in `packages/engine/src/cards/fixtures/` say `SYNTHETIC` in their names.
   - Grammar: the rule's `examples` and `rejects` (the registry meta tests run them), a lowering test, and a test that the engine runs what the lowering produces.
   - The golden corpus snapshot for the requested card once the owner has extracted it, and a sample of newly unlocked ones.
   - A test that plays the requested card in a game (scenario, or a soak deck style in `packages/ai/test/helpers.ts`).
7. **Implement** at the level chosen. Update the AI: every new decision kind needs a `CasualAgent` handler (the compiler enforces the decision switch), and a heuristic so the AI uses the mechanic sensibly. The web needs a UI for a new decision kind and a log line for a new event (exhaustive switches in `apps/web/src/game/describe.ts` and the decision overlays).
8. **Verify.** `pnpm format`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm e2e` when the web changed (`CHROMIUM_PATH=/opt/pw-browsers/chromium` in the cloud sandbox). For engine changes, the soak tests run in `pnpm test`; mutation-check the key behaviour (break it on purpose and see the tests fail). Coverage must not drop: the `Coverage` workflow (D-090) checks it on the pull request. Review every diff of `golden.expected.json` (`UPDATE_GOLDEN=1 pnpm exec vitest run packages/cards/test/golden.test.ts`): an unexpected change to a supported card is a regression.
9. **Record.**
   - `docs/MECHANICS.md`: a section per engine slice (the grammar rules themselves are documented in their rule files, `examples`, `rejects` and `cites`).
   - `docs/RULES_COVERAGE.md` for rules support; `docs/ROADMAP.md` for what is still missing.
   - A `D-` entry in `docs/DECISIONS.md` for any choice.
   - Bump `PARSER_VERSION` (`packages/cards/src/version.ts`) whenever any card changes status or AST, and `ENGINE_VERSION` (`packages/engine/src/version.ts`) when the state shape or behaviour of existing cards changes. Both invalidate cached support reports.
   - A card that is still blocked is reported with what is missing, or the proposal that waits for approval; if it came from an issue, say so there.
10. **Report** for each card: supported or not, why, the gap class, what else it unlocked, anything waiting for approval, and what the owner must run (coverage, extract).

## Rules for the loop (SPEC 8.3)

- Never mark a card supported without tests. Support is proven per grammar rule and primitive, not per card (D-008).
- Never special-case a card by name in engine code. A one-off stays unsupported (D-167).
- Never weaken an existing rule implementation to make a new card fit. When a test fixture stops being unsupported because the engine learned a feature, move the test to a feature that is still unsupported; do not loosen the test.
- If the CR and a Scryfall ruling seem to disagree, follow the CR and record it in `docs/DECISIONS.md`.
- Honesty: text the engine does not understand is dropped as a whole and flagged, never half run.

## Lessons learned

- **CR numbers from memory are often wrong.** During M5, briefs cited search, discard and shuffle with wrong numbers (the repository's text has 701.23, 701.9 and 701.24), misplaced "can't be prevented" (615.12), and put targets before the kicker question (it is the other way, CR 601.2b-c). Always look the rule up with `pnpm rule` and cite the number the repository's CR text gives.
- **Defaults hide rules.** An object an effect puts onto the battlefield enters under the control of the effect's controller unless the effect says otherwise (CR 110.2a); an early default of "the owner" was wrong for "return ... to the battlefield under your control" and for every flicker by another player's effect (D-085).
- **A search "for a card" must find one when one exists** (CR 701.23d); "up to" and "a card with a stated quality" may find nothing. The search primitive distinguishes them.
- **Check the layer and timestamp of every continuous effect** against CR 613 before trusting a test that happens to pass: a set P/T effect and a counter look the same until both apply to one creature.
- **Engine features change test fixtures.** A test that used "an unsupported card" breaks when the engine learns that feature. Pick a feature that is still out of reach and say why in the test.
- **The golden corpus needs the owner's run.** The extractor must skip prints that are not Commander-legal (art series cards share names with real cards); `pnpm corpus:extract` keeps the Commander-legal print.
- **Seed searches and soaks are slow under load.** Give them an explicit timeout rather than shrinking them; a flaky timeout is not a flaky rule.

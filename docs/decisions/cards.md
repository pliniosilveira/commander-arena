# Card data, parser and deck support decisions

Entries keep their old numbers (see `README.md`).

## Support status and honesty

- **D-007 "Supported" includes a runtime guarantee.** `validateAst` runs at parse time; the interpreter has no not-implemented path; an interpreter failure is an engine bug and the card is downgraded for that game.
- **D-008 Test coverage is per grammar rule and primitive, not per card,** plus the curated AST snapshot set.
- **D-056 A deck with an unsupported card is invalid and cannot be played** (a commander included). The import panel says why and offers a support request or replacing the card. (This replaced the "Play anyway" confirmation, D-055.)
- **D-317 The goal is to support every card.** A costly card is built later, never recommended for skipping: surveys give the cost, the risk and the order.

## Parser and corpus

- **D-052, D-063 A small two-stage parser.** Oracle text is normalized per face, split into abilities and matched against composable rules that must consume the whole ability; a segmenter builds a typed clause IR and rule families (trigger, cost, effect, noun, amount, duration, condition, keyword, static, token, restriction, replacement) lower it. **D-069:** no grammar DSL and no parsing dependency without a new decision.
- **D-065 Rule authoring contract.** Every rule is `defineRule({ id, family, leading, parse, examples, rejects, cites })`; meta tests require exactly one matching rule per family for each golden example, failing `rejects` lines, and a scenario test reaching every rule id and feature ref.
- **D-064 Diagnostics.** Each unparsed ability reports a reason (`unrecognised`, `notRunnable`, `unboundReference`), the slot family, the recognised rules, the missing `FeatureRef`s and the template.
- **D-066 Golden corpus.** `golden.jsonl` holds real cards' Oracle text and `golden.expected.json` is the CI coverage gate; 25% of the cards (by `oracle_id` hash) are a hold-out reported separately to detect overfitting.
- **D-057, D-058 Template analysis and corpus tooling.** `analyzeTemplates` groups unparsed abilities by shape; `tools` use `@commander-arena/cards` through its public API only, with a small resolve hook so plain `node file.ts` loads the packages. `--check` compares supported counts with `reports/coverage-baseline.json`.
- **D-053 Import pipeline.** The decklist parser never throws; names go to Scryfall's collection endpoint by front face, results are matched by name and never by position, with `named?exact=` then `fuzzy` fallbacks.
- **D-167 No community definitions** and **D-166 no in-app support-request pipeline**; the owner's route for a card is the engine's real-card fixtures and, for a whole deck, the deck support issue (D-244).
- **D-355 SYNTHETIC names are unique.** A test fixture that is not real Scryfall data says `SYNTHETIC`, and `synthetic-unique-names.test.ts` fails when a name belongs to two cards.
- **D-134 Creature types** in the grammar come from the CR 205.3m table (`pnpm creature-types:generate`), and their plurals from English endings.

## Deck support routine and precons

- **D-137 Precons are a decklist plus a snapshot** (`apps/web/src/precons/snapshots/<id>.json`: id, name, blurb, the decklist as given, the stored cards; deterministic). The app lists exactly the snapshots and starts one only when it is a valid Commander deck of fully supported cards.
- **D-244, D-245 The import screen's button** opens a prefilled GitHub issue "deck support <name>" carrying the unsupported cards' data, gzip-compressed and base64url-encoded; `pnpm corpus:from-issue` adds those cards to the golden corpus.
- **D-251, D-290 to D-294, D-322 The routine.** `pnpm corpus:check-issue` decides whether an issue is complete; the triage workflow labels it `deck-support:ready` (fetching card data from Scryfall on a runner when the issue lacks it); an agent routine builds the oldest ready issue within a weekly token budget, keeps a progress comment and reports at least hourly; `Scryfall lookup` lets a cloud session read one Scryfall page. The routine's rules are `.claude/skills/deck-support/SKILL.md`.
- **D-562 The "Precon issues" workflow** opens one issue for each Archidekt Commander precon the app lacks (or whose list differs); a deck's planar cards are set apart. **2026-11-17 (PR 268):** the triage workflow also makes the precon's snapshot on a runner and posts it, compressed, in a comment (about 20,000 characters against the 65,536 a comment holds); the routine decodes it with `pnpm precon:from-comment` into the same pull request as the card support. The blurb is derived from the commander; a precon with no unsupported card gets its comment but no routine takes it yet.

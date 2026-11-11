# Prior art

Other projects that were read or studied, what was adopted, and the limits on reuse. Surveys ran on 2026-10-20 (shallow, through a summarizing fetch tool: feature lists are the projects' own claims) and 2026-10-28 (sparse clones, source files read directly). Trimmed on 2026-11-01 (D-169): the survey detail that nothing uses is gone; the section numbers cited from code and documents are kept (7.2 and its heuristic numbers, 7.3, 7.5). Anything not read from a primary source is marked "unverified".

**Constraints that decide reuse (SPEC 4, 11 and A16 in 17.4):** our code is MIT, so GPL, AGPL and noncommercial code and data cannot be copied: study them and describe the idea in our own words. Permissive code (MIT, Apache-2.0) may be adapted with attribution (a credit line in the file and in `docs/DECISIONS.md`). We need TypeScript or data, browser-runnable, no server. Rules fidelity and honesty come first. No code or data from any project below has been copied into this repository.

## 1. Summary

- No mature, MIT, browser-runnable TypeScript MTG rules engine exists in what was found. The only TypeScript engine, sjarmak/mtg (MIT), is tiny and covers an original-card DSL. phase.rs (Rust to WASM, MIT or Apache-2.0) is the most capable browser-capable engine, but adopting it would replace ours. We built the engine ourselves.
- No project found parses Oracle text into a typed AST at scale with honest statuses. Forge, XMage and Magarena hand-author per-card data or code. The only MIT, browser-runnable Oracle parser (CubeArtisan/magic-card-parser) is stale since 2021 and outputs ambiguous, untyped parses. We built the grammar ourselves.
- Nothing was adopted as code or data. The value was design lessons and test ideas (section 4).
- We wrote our own small layers: a rate-limited Scryfall queue with cache, a mana-symbol parser, a decklist parser and a Commander validator. The Scryfall packages checked were stale, Node-oriented or both.

## 2. Licenses of what was looked at

| Project | License (as read) | Verdict |
|---|---|---|
| [phase.rs](https://github.com/phase-rs/phase) | MIT or Apache-2.0 (LICENSE-MIT read; the Apache file was not) | Study; adapt with attribution |
| [XMage](https://github.com/magefree/mage) | MIT (LICENSE.txt read) | Study; adapt with attribution |
| [argentum-engine](https://github.com/wingedsheep/argentum-engine) | MIT (LICENSE read) | Study (JVM server; masked view, cards as data) |
| [sjarmak/mtg](https://github.com/sjarmak/mtg) | MIT (copyright "mtg-lab authors": check before copying) | Study (refuse-don't-approximate policy) |
| [Forge](https://github.com/Card-Forge/forge) and its wiki | GPL-3.0 | Ideas only: no code, scripts, card data or wiki text |
| [Magarena](https://github.com/magarena/magarena) | GPL-3.0 (per repo page) | Ideas only; do not copy `effects.txt` lines or `mtg.peg` |
| [Cockatrice](https://github.com/Cockatrice/Cockatrice) | GPL-2.0 (LICENSE read) | Ideas only |
| [deckmaste.rs](https://github.com/msmorgan/deckmaste.rs) | PolyForm Noncommercial 1.0.0 (per repo page) | Cannot copy; cite the architecture idea |
| [academyruins-api](https://github.com/lunakv/academyruins-api) | AGPL-3.0 | Ideas only; do not depend on its hosted data (license unverified) |
| [CubeArtisan/magic-card-parser](https://github.com/CubeArtisan/magic-card-parser) | MIT | Study (Ambiguous and Incomplete statuses, parse rate per commit) |
| [MTGJSON](https://github.com/mtgjson/mtgjson) | MIT (LICENSE.txt read) | Possible token data source (7.6); card text and art remain Wizards' property |
| [Cockatrice Magic-Token](https://github.com/Cockatrice/Magic-Token) | public domain dedication | Possible token data source (7.6) |
| [Mana (mana-font)](https://github.com/andrewgioia/mana) | font SIL OFL 1.1, CSS MIT, glyph art Wizards copyright | Naming scheme only; do not ship the glyphs without a legal decision |
| Scryfall bulk and rulings data | not open source; terms not read | Fetch at runtime or from the owner's bulk file; never bundle rulings text |

Other projects were checked and ignored (stale, wrong language, Node-only or unreadable license): scryfall-sdk and `@scryfall/api-types` (MIT), mtg-decklist-parser (MIT), scryfall-scry (license unreadable), LibJudge (Apache-2.0), msmorgan/mtg-rules (MIT), gregario/mtg-oracle (MIT), card2code (Apache-2.0, data crawled from XMage), Manafold, and two papers whose text was unreadable. Licensing traps to remember: Forge, Magarena, academyruins (AGPL) and deckmaste.rs cannot be copied or consumed as data; the mana-font glyphs are Wizards of the Coast property; the Fan Content Policy wording on CR redistribution was not read.

If a later session wants to adopt something, the bar is: a permissive license read from the LICENSE file, TypeScript or plain data, browser-runnable, active in the last 12 months, and a stated reason in `docs/DECISIONS.md`.

## 3. Adopted

Nothing as code or data.

## 4. Studied

Design references only. Nothing is to be copied from GPL, AGPL or noncommercial projects.

- **phase.rs.** Engine architecture (layers, state-based actions, triggers, replacement, priority, stack) as WASM plus a React client. Its determinizer (7.2) and paired-seed AI gate shaped our AI work. Unverified: its parser approach.
- **XMage `ContinuousEffects.java`.** Layer and SubLayer enums, timestamps, an applied-effects set per event so a replacement applies once, an affected-player choice hook for CR 616.1c, the commander replacement as a named exception. Fits A1. We designed CR 613.8 dependency ordering ourselves; the portion read did not show it. XMage's tests are a source of expected-behavior ideas (7.3).
- **Forge scripting model.** Typed effect-plus-params per card, AI hints in separate SVars: supports keeping AI hints out of the AST (SPEC 4.3 and 9). Its replacement page documents no conflict resolution, so ordering comes from CR 616.
- **argentum-engine.** Cards as pure data without card-specific engine logic; AI and Gym wrapper see only the masked state a human sees (matches SPEC 9 and A10); drafted card code is reviewed by a human (unverified, from a mirror's README).
- **sjarmak/mtg.** A card runs only if it has an exact representation: the same policy as SPEC 7.1 and A7, which we can cite as precedent.
- **CubeArtisan parser.** Ambiguous and Incomplete statuses and the parse rate recorded per commit: matches SPEC 7.2 diagnostics and 7.3 non-regression. Its README says its parses are not guaranteed correct, the failure mode `validateAst` (A7) prevents.
- **Magarena `effects.txt`.** A template list doubling as coverage documentation with an unimplemented section: supports the backlog report.
- **deckmaste.rs.** Grammar tree to a typed intermediate form to engine types, with the regex pipeline kept as the production path while grammar-based recovery matured.
- **Others.** The scryfall-scry request-spacing queue and pluggable cache (our SPEC 6.2 limits are stricter and come from Scryfall's documentation, which wins); Cowling, Ward and Powley's ensemble determinization (sample hidden information, search each sample, aggregate; citation details unverified).

## 5. Open points

- Licensing questions for the owner stay in `docs/STATUS.md`: the committed CR text, Scryfall data in the precon snapshots and the golden corpus, and the mana-font glyphs.
- No target of this survey reports a verified automatic parse rate at scale, so the 60% target of SPEC 7.3 has no external precedent; the real number is reported at each milestone.

## 6. Not found

A mature TypeScript MTG rules engine, with or without Commander; an open project that parses real Oracle text into a typed AST with a verified high parse rate; a released MCTS or determinization agent for MTG with code (only the Cowling et al. paper); TypeScript libraries for mana-cost parsing, color identity or Commander validation; an official machine-readable CR changelog.

Hosts that did not resolve from the first survey container (so their pages were never read): scryfall.com, arxiv.org, eprints.whiterose.ac.uk, slightlymagic.net, journals.flvc.org, deepwiki.com, hexdocs.pm, api.academyruins.com, git.sr.ht. Retry from a different network before relying on any claim about them.

## 7. Follow-up survey (2026-10-28): Forge, XMage, Cockatrice

Method: shallow, sparse `git clone`s through the session proxy, then reading the source files and docs themselves. Ideas are described in our own words. Forge, Cockatrice and Magarena are GPL: ideas only. XMage and phase.rs are permissive: an idea or algorithm may be adapted with attribution, but nothing was pasted.

### 7.1 Sources read

| Project | Commit read (date) | License (file read) | What was read |
| --- | --- | --- | --- |
| [XMage](https://github.com/magefree/mage) | `f0648a8f39` (2026-10-27) | MIT | `Mage.Player.AI`, `Mage.Player.AI.MAD`, `Mage.Player.AIMCTS`; the `Mage.Tests` tree and about 40 test files; the priority-skip settings |
| [Forge](https://github.com/Card-Forge/forge) | `4af7e6025f` (2026-10-28) | GPL-3.0 | `forge-ai` (block, attack, combat, evaluator, profiles, simulation headers), `forge-gui/res/ai/*.ai`, the yield-options and user-guide docs |
| [Cockatrice](https://github.com/Cockatrice/Cockatrice) | `5cf3358c99` (2026-10-28) | GPL-2.0 | `README.md`, the FAQ, the deck-list library and `deck_file_format.h` |
| [Cockatrice/Magic-Token](https://github.com/Cockatrice/Magic-Token) | `4f597793c7` (2026-09-25) | public domain dedication | `README.md`, `tokens.xml` (counted only) |
| [MTGJSON](https://github.com/mtgjson/mtgjson) and its website source | website `19d7600137` (2026-10-21) | MIT | the token, related-cards and identifiers data models, the FAQ |
| [phase.rs](https://github.com/phase-rs/phase) | `59ec6c2b3a` (2026-10-28) | MIT (Apache file not read) | `docs/AI-CONTRIBUTOR.md`, `docs/ai-combat-tax.md`, the `phase-ai` file list and headers of `determinize.rs`, `deck_knowledge.rs`, `decision_receipt.rs`, the AI gate workflow |

Not reachable (proxy 403): mtgjson.com, cockatrice.github.io, scryfall.com; Scryfall and Wizards hosts are blocked by policy.

### 7.2 AI (M7)

What the other engines do, in brief:

- **Attacks.** Forge picks an aggression level from race ratios and keeps back enough blockers to survive the predicted next combats. XMage first checks an "alpha strike" (assume each potential blocker stops one of the biggest blockable attackers; attack with everything if what is left is lethal), otherwise an attacker stays home when a blocker would survive it and kill it, with exceptions for flying, deathtouch and indestructible. XMage's own comment says its combat minimax does not work.
- **Blocks.** Forge assigns blocks in tiers (good blocks, gang blocks, trades, chump blocks only when life is "in danger", reinforcement) and re-plans more defensively if still in danger; danger is life under a threshold, poison above 7, or a commander that would reach 21. XMage simulates each possible blocker one on one on a game copy and takes the weakest blocker that survives, or a dying blocker only when the evaluated score is not worse.
- **Removal.** Forge filters out targets already dying, regenerating, returning (undying, persist) or sacrificable in response. XMage sorts targets by outcome and breaks ties by name and id so every simulation picks the same one.
- **Scores.** Forge's creature evaluator adds power, toughness, mana value and keyword values scaled by power, with a reason label per term. XMage scores life with a concave table, permanents, and cards in hand, for two players only.
- **Mana and timing.** Forge avoids a tapped land when a spell is castable, can hold the land drop for the second main phase, and gives each play a reason with "play later" windows. XMage's minimax searches its own action sequences with alpha-beta.
- **Hidden information.** Forge's Monte Carlo samples pool the opponent's hidden cards, shuffle and deal them back into the same slots. XMage's MCTS puts the opponent's hand back into the library and redraws. phase.rs resamples only the opponent's unknown cards from "decklist minus public cards" and never touches the AI's own zones.

**Fit with our design.** All three engines let the AI know the opponent's decklist. A10 was stricter; A31 (D-161, owner decision 2026-10-30) now lets the AI know the initial decklist and revealed cards, never a hand or a library order, and `determinize` follows the pooled re-deal of Forge and phase.rs. Forge's hand-written card-name exceptions in the AI (`SpecialCardAi.java`) are the pattern our rules forbid: our AI reads the AST and the view. Simulating a block on a copy fits us better than it fits them: our state is plain JSON and `applyAction` is pure.

**Ranked heuristics.** The first two are what `GreedyAgent` (A11) needed; all ten are implemented by `HeuristicAgent` and its harness (D-162, D-163, D-164; the module comments name the heuristic each file follows). "Idea only" means describe and reimplement; "adapt with attribution" means a permissive algorithm may be followed closely with a credit line.

| # | Heuristic | Comes from | License constraint | Implemented in |
| --- | --- | --- | --- | --- |
| 1 | **Lethal check and crack-back.** Assume each untapped opposing blocker stops one of the biggest attackers it can block; if what is left is lethal (life, poison or 21 from one commander) attack with everything; otherwise keep home enough untapped creatures that the opponent's best attack next turn leaves us above a danger line. | XMage `CombatUtil.canKillOpponent`; Forge `AiAttackController.notNeededAsBlockers` | XMage part: adapt with attribution; Forge part: idea only | `heuristic-danger.ts`, `heuristic-attacks.ts`; the lethal check of `greedy-combat.ts` (D-162, D-163) |
| 2 | **Tiered blocks driven by a danger test.** Good blocks first, then value trades, then chump blocks only while the predicted result is "in danger"; re-plan more defensively if still in danger. Danger: life after unblocked damage below a threshold, poison reaching 10, a commander reaching 21. | Forge `AiBlockController`, `ComputerUtilCombat.lifeInDanger`; XMage `CombatUtil.blockWithGoodTrade2` | Forge: idea only; XMage: adapt with attribution | `heuristic-blockplan.ts`, `heuristic-blocks.ts`, `heuristic-duel.ts`, `heuristic-danger.ts` (D-163) |
| 3 | **Score combat by simulating it on a clone.** For each candidate block (and the no-block baseline) copy the state, apply the declarations through `applyAction`, let both seats pass through combat damage, and score the result. All of combat is public. | XMage `willItSurviveSimple` and `willItSurviveSimulation` | Idea | `heuristic-sim.ts`, `heuristic-blocks.ts`, `heuristic-attacks.ts` (D-163) |
| 4 | **A board score with a concave life curve and power-scaled keywords, explainable.** Life worth less per point as it grows, commander damage as its own clock, keyword values that grow with power, tokens below cards, tapped or summoning-sick creatures discounted, a bonus per card in hand; every term carries a reason. | XMage `ArtificialScoringSystem`, `GameStateEvaluator2`; Forge `CreatureEvaluator` | Idea only (XMage's scoring file credits Magarena's author; provenance unverified) | `evaluate.ts` (D-162) |
| 5 | **Removal targeting with "do not waste it" filters.** Rank opposing permanents by the board score with the opposing commander and planeswalkers first among near-equals; skip targets already dying, returning (persist, undying) or protected; break ties by object id with a plain code-unit compare (our lint bans `localeCompare`). | Forge `DestroyAi`; XMage `PossibleTargetsComparator` | Forge: idea only; XMage: adapt with attribution | `heuristic-targets.ts` (D-163) |
| 6 | **Timing: hold tricks, flash and removal for the right window.** After blockers (pumps, only if the result changes), the opponent's end step, or in response; lands not needed this turn are played after combat. | Forge `AiPlayDecision` "play later" reasons and profile options | Idea only | `heuristic-main.ts`, `heuristic-lands.ts` (D-163) |
| 7 | **Every decision carries a reason code**, returned with the action and written to the AI log; soak tests count them and scenario tests assert them. | Forge `AiPlayDecision`; phase.rs `decision_receipt.rs` | Idea (phase.rs: adapt with attribution) | `reasons.ts` (D-162) |
| 8 | **Land and color planning.** Play the land that lets the best spell be cast this turn; a tapped land when no spell needs the mana; otherwise a land that adds a missing color. "Most expensive castable" becomes "the set of spells that uses the most mana". | Forge `chooseBestLandToPlay`, `reserveManaSources` | Idea only | `heuristic-mana.ts`, `heuristic-lands.ts`, `heuristic-main.ts` (D-163) |
| 9 | **Decide optional costs before declaring.** When an attack or block carries a tax, trim the declaration first and answer the payment prompt "pay if affordable", so a declined payment never re-asks forever. | phase.rs `ai-combat-tax.md` | Adapt with attribution | `heuristic-attacks.ts` (D-163) |
| 10 | **Measure with paired seeds and swapped seats**, comparing agents on the same seeds to cut the variance of the A11 targets. | phase.rs paired-seed AI gate; Forge flat Monte Carlo's common random numbers | Idea | `arena.ts`, `pnpm ai:arena` (D-162, D-164) |

Not to adopt: card-name branches in AI code (Forge `SpecialCardAi.java`, `lifeInDanger`), shuffle cheating (Forge `cheatShuffle`), and an evaluator limited to two players (XMage's says so) if v2 is to reuse it. Still open from this section: an AI scenario suite like XMage's `AI/basic`, and a nightly AI regression gate with a drift issue like phase.rs's (D-132).

### 7.3 XMage tests as a rules oracle

XMage's test suite is large (about two thousand Java files, over a thousand single-card tests, and folders for continuous effects, replacement, copy, commander, combat and lki). A test puts real cards by name into zones, queues actions by turn and step, queues answers, runs to a stop point and asserts: the same shape as our scenario DSL (A12), so scenarios translate one to one, in our own words and with our own card choices.

**Caveats before porting.** (a) Expected results must be re-derived from today's CR: our CR marks "Damage Assignment Order" obsolete (CR 510.1c now lets the attacker divide damage freely), and older tests encode rules that have changed. (b) Several XMage layer tests are `@Ignore`d with notes that they fail although the game works: good targets for us, but XMage does not prove them. (c) Test comments quote Oracle text; ports describe the abilities in our own words. (d) Cards our engine does not support are replaced by fixtures with the same ability shape, marked SYNTHETIC (`AGENTS.md`).

**Scenarios to port, in priority order** (our weakest areas first: CR 613.8 dependency, 616 ordering, 707 copies, simultaneous departures, 903 commander, state-based actions). None is ported yet (`docs/ROADMAP.md`).

| # | Scenario (our words) | CR | XMage source (`Mage.Tests`, `org/mage/test/...`) |
| --- | --- | --- | --- |
| 1 | An equipment that makes its creature every creature type, and a static that gives all Slivers a combat-damage trigger: the equipped token gets the trigger. The grant depends on the type change (the D-139 gap "group types read a view from before the other statics"). | 613.8a, 613.1d, 613.1f | `cards/continuous/GainAbilityDependenciesTest` `test_SliverGain` |
| 2 | "Nonbasic lands are Mountains" and "each land is also a Swamp" from a nonbasic land: the type change removes the second land's ability whatever the timestamps, so no land is a Swamp. | 613.8a, 305.7 | `cards/continuous/LayerTests`, `LandTypeChangingEffectsTest` |
| 3 | A land-type change (layer 4) and a granted "tap for any color" (layer 6) in both cast orders: the granted ability survives either way. | 613.1d, 613.1f, 305.7 | `LandTypeChangingEffectsTest` |
| 4 | "All permanents are enchantments" plus "other non-Aura enchantments are creatures with power and toughness equal to mana value": lands become 0/0 and die; an artifact gets its mana value; tokens without a mana cost die, a token copy with one survives. | 613.8a, 704.5f | `cards/continuous/DependentEffectsTest` |
| 5 | A three-step chain: a creature-type setter depends on "enchantments are creatures", which depends on "permanents are enchantments"; applied in dependency order regardless of timestamps. | 613.8a-c | `LayerTests` `testMultipleLayeredDependency` |
| 6 | "Creatures lose all abilities and are 1/1" against a creature whose power and toughness come from its own ability: the 1/1 wins (7b after 7a). | 613.4a-b, 604.3 | `cards/replacement/HumilityTest` |
| 7 | A creature with "if this would be put into a graveyard, shuffle it into the library instead" does not die (no dies triggers); under "creatures lose all abilities" it goes to the graveyard. | 614.1a, 613.1f, 700.4 | `cards/replacement/ZoneChangeReplacementTest` |
| 8 | A board wipe against three opposing creatures while "if a creature an opponent controls would die, exile it instead and make a token" is in play: three exiles, three tokens. | 614.1a, 616.1 | `cards/replacement/WouldDieExileInsteadTest` |
| 9 | Two "enters with additional +1/+1 counters" replacements and a counter-adding trigger: the controller orders the replacements and the totals match each order. | 616.1, 616.1e, 614.1c | `cards/replacement/entersBattlefield/HardenedScaleTest` |
| 10 | A commander is exiled and its owner moves it to the command zone: "whenever a creature is exiled from the battlefield" still triggers. A commander destroyed with an Aura that returns it: the owner may leave it in the graveyard so the Aura brings it back. | 903.9a, 704.6d, 603.6c | `commander/duel/CommanderReplaceEffectTest` |
| 11 | Two "whenever this or another creature dies" creatures; one dies with others in the same event: the dying one still triggers for every creature that died with it. | 603.10a, 603.6c | `cards/triggers/dies/BloodArtistTest` |
| 12 | "Whenever another nontoken creature dies" and a wrath that kills tokens and nontokens together: triggers only for the nontoken ones. | 603.10a, 111.1 | `cards/triggers/dies/HarvesterOfSoulsTest` |
| 13 | A persist creature with an Aura "when enchanted creature dies, make X tokens where X is its power": X uses the last-known power, and the persist return does not change it. | 608.2h, 603.10a, 702.79a | `lki/LastKnownInformationTest` |
| 14 | A copy creature copies a persist creature and dies: persist returns it and it may copy again; the copied enters trigger fires each time. | 707.2, 702.79a, 400.7 | `cards/copy/PhantasmalImageTest` |
| 15 | A copy of a creature with a leaves-the-battlefield trigger: the copy triggers; if it lost all abilities before it left, it does not. | 707.2, 603.10a, 613.1f | `cards/triggers/dies/ThragtuskTest` |
| 16 | Double strike with trample against an indestructible blocker: the second strike assigns all its damage to the player, since lethal damage was already assigned; trample with deathtouch needs only 1 per blocker. | 702.4b, 702.19b, 702.2c, 510.1c | `combat/DamageDistributionTest` |
| 17 | "All permanents are artifacts", "artifacts are creatures with P/T equal to mana value" and "creatures lose all abilities and are 1/1" together: a stable result (everything dies) without looping. | 613.8, 704.3 | `LayerTests` |
| 18 | A spell copy of a kicked spell or a spell with X keeps the kicker and X; a copy of a permanent spell enters as a token. | 707.10, 707.10c, 707.10f | `cards/copy/CopySpellTest` |

Ports 1 to 5 test CR 613.8 dependency, which `docs/RULES_COVERAGE.md` lists as Partial; 7 to 9 test CR 614 and 616; 10 tests CR 903.9a.

### 7.4 Priority and stop UX

Forge and XMage both offer per-step stops, an "auto-pass when nothing can be done" mode and standing answers to triggers; Forge adds one-shot yields (a marker on any phase pip, "yield to stack" and "resolve entire stack") and a configurable interrupt list, and sleeps 200 ms between auto-passed phases and 400 ms between stack resolutions. Ours is the relevant-action rule of A18 with per-step stops (`StopSettings`) and Pass Turn. Ideas still open (UI policy only; every pass stays an ordinary pass action): a visible interrupt list that also cancels a yield, a skippable pause after AI actions that change the board (the D-138 pacing item), standing "always yes" and "always no" answers to optional triggers with a list in Settings to clear them (A18 specifies them; none was found in `apps/web/src` by search), and one key that cancels every yield. See `docs/ROADMAP.md` for what is deferred.

### 7.5 Cockatrice

- **No rules engine.** The README describes an application for playing tabletop card games over a network with a server that prevents manipulation; no rules enforcement is claimed, and the FAQ sends rules questions to judges. The absence of an engine is inferred from these documents, not from reading all of the code.
- **License:** GPL-2.0 (LICENSE read). Ideas only.
- **The `.cod` format:** XML with a root `cockatrice_deck` (attribute `version` "1"); metadata elements; then `zone` elements named `main`, `side`, `tokens` or `maybeboard`, each holding empty `card` elements with attributes `number`, `name` and optionally `setShortName`, `collectorNumber` and `uuid` (the provider is unverified). No commander zone was found, so a `.cod` file does not say which card is the commander. Cockatrice also reads and writes plain text.
- **Verdict:** low value. Our import already asks for the commander and reads plain text, which Cockatrice exports; `.cod` adds only set and collector numbers. A low-priority item in `docs/ROADMAP.md`.

### 7.6 Token data and token art (issue 36)

**What we have.** The Zombies snapshot (`apps/web/src/precons/snapshots/zombies.json`) stores `relatedParts` from Scryfall's `all_parts` as name and component only: 16 of its cards list a `token` part. The schema keeps only `name` and `component` (`packages/cards/src/scryfall/schema.ts`). Unverified (Scryfall's docs are blocked): whether each `all_parts` entry also carries the token printing's id, URI and type line, and whether the `oracle_cards` bulk file contains token card objects.

**Why the name alone is not enough.** Many tokens share a name with different characteristics (Cockatrice's file keeps one "Zombie Token", a 2/2 black creature with 62 printings, next to "Zombie Army", "Zombie Knight" and others). Our engine makes each token from the card's AST, so an image can be attached only when it provably shows the same token.

**Data sources.** MTGJSON (MIT) lists token cards with `scryfallId` and `scryfallOracleId` identifiers and the cards that make them; it hosts no images. Cockatrice Magic-Token (public domain) has 1,035 token entries (source version 20260925) with creators, set codes, uuids and picture URLs, mostly on `cards.scryfall.io`.

**A path that keeps our rules (offline snapshots, no invented data); the owner decides:**

1. Owner check on the bulk file already used for snapshots: does `oracle_cards` contain token objects, and which fields does an `all_parts` entry carry?
2. If the token's id is there, `pnpm precon:snapshot` also stores each token part's own card object from the same bulk file, looked up by id (or by name, with an ambiguous name stored as ambiguous rather than guessed).
3. The web shows a token image only when the engine's token matches the stored token exactly (name, colors, types, power and toughness, keywords, text); any mismatch keeps the generic frame of D-138.
4. Fallbacks, each needing a `D-` entry for a new data source: MTGJSON set files or the Magic-Token file. Images keep loading from Scryfall at runtime.

### 7.7 Not read or unverified in this follow-up

- Scryfall's API docs (blocked): the full field list of an `all_parts` entry, and whether `oracle_cards` holds tokens.
- mtgjson.com and cockatrice.github.io pages (proxy 403); their GitHub sources were read instead.
- XMage's client code for animation or pacing, and its core `createSimulationForAI`.
- The internals of Forge's `GameStateEvaluator`, `StrategicEvaluator`, `ComboPlan` and `ComputerUtilMana` beyond the headers and method names cited.
- Which provider the `uuid` of a Cockatrice `.cod` card refers to.
- Whether XMage's `ArtificialScoringSystem` was ported from Magarena (only the author credit was seen).
- The phase.rs Apache license file, and its AI internals beyond the files named in 7.1.

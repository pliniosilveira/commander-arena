# Commander Arena: specification

The current, authoritative statement of what Commander Arena is and how it behaves. It was collapsed on 2026-11-01 from the original specification and its 31 amendments (D-169). Section numbers and amendment numbers are cited from code, tests and documents, so they stay stable: section 17 is the index that resolves every amendment number. The history of each decision is in `docs/DECISIONS.md`; the state of the work is in `docs/STATUS.md`.

## 1. Role and mission

Commander Arena is an unofficial, free, in-browser game of Magic: The Gathering Commander: one human against an AI, driven by a pure TypeScript rules engine that follows the Comprehensive Rules (CR) and executes each card's current Oracle text exactly.

**Rules fidelity is the top requirement.** Players import arbitrary decks, so when the engine cannot execute a card correctly it says so up front instead of playing it wrong. A missing card is an inconvenience. A card that silently does the wrong thing makes players distrust every other card.

**Card support grows over time.** No parser understands every card. Support grows through a repeatable procedure (section 8): a card is analysed, the missing capability is added in a general form that unlocks every card using it, and the knowledge stays in the code and the documents.

## 2. Scope

- Commander, 1v1: one human against one AI. It runs entirely in the browser with no backend and deploys as a static site.
- Deck import from pasted text (Arena, MTGO, Moxfield, Archidekt formats), with card data from the Scryfall API, and built-in precons with card-data snapshots for a quick start. Every card gets a support status; the import screen shows a coverage report.
- **v2 (designed for, not built):** free-for-all Commander (CR 806) with 2 to 6 seats. Nothing in v1 may assume exactly two players: seats are an ordered array, and "opponent" is always resolved through the rules (each opponent, target opponent, defending player), never as `players[1]`.
- **Out of scope** (no stubs left for them): online play between humans (the engine stays pure and serializable, but there is no networking), other formats, sideboarding, ante, subgames, Un-cards, Conspiracies, Attractions, accounts and monetization. Cards that need these are flagged unsupported.
- **Removed from the product** (D-165 to D-168): player-facing save, load, resume, replay export and import; the support-request pipeline; community card definitions and per-card override files; the Easy AI level.

## 3. Priorities for trade-offs (in order)

1. Rules correctness for every card marked supported.
2. Honesty: cards the engine does not fully understand are flagged, never guessed.
3. Determinism and testability.
4. An AI that is legal, responsive and reasonably competent.
5. Visual polish and animation.

## 4. Architecture

### 4.1 Stack

Defaults are recorded in `docs/DECISIONS.md` (D-029, D-030, D-032); deviations need a new entry there.

- TypeScript in strict mode with pnpm workspaces, exact pinned dependencies. Biome for linting and formatting; dependency-cruiser for the package boundaries. React 19 with Vite, Zustand for UI state, Comlink for the Worker RPC. Zod schemas for serialized data (the AST, `GameState`, the card pipeline). Vitest for unit and scenario tests, fast-check for property tests, Playwright for browser tests.
- Packages: `packages/engine` (pure rules engine: no DOM, network, timers, Node built-ins or randomness; imports only itself and `zod`), `packages/cards` (decklist parsing, Scryfall client and cache, the Oracle parser, the engine's real-card fixtures, validation, coverage tooling), `packages/ai` (agents; depends only on the engine's public API), `apps/web` (React UI; the engine and AI run in a Web Worker so the UI never freezes). A lint rule fails the build when a package imports what it must not (`AGENTS.md`, `tools/boundaries`).
- IndexedDB is the card cache (`docs/ARCHITECTURE.md` says where that code runs). Player-facing saves do not exist (D-165).
- One pull request per milestone, merged to `main` after the checks pass; `main` is always deployable.

### 4.2 Engine design

- **State is plain data.** `GameState` is JSON-serializable: no class instances, functions or cycles. Updates are immutable with structural sharing (A6): `applyAction` returns a new state that shares unchanged subtrees, never a deep clone, and derived characteristics are cached per state version. The AI clones by reference.
- **One way to change state.** `applyAction(state, seat, action) → { state, events }` is the only mutation path; `getLegalActions(state, seat)` lists what a seat may do. The UI and the AI use exactly this API. Manual adjustments, concede and auto-passes are ordinary actions in the action log (A25).
- **Decisions are explicit.** The engine is always waiting on exactly one `PendingDecision` for exactly one seat (A2). Having priority is a decision kind (cast, activate, play a land, special action, pass). Every choice the rules require is a typed decision: targets, modes, X, dividing damage or counters, cost payment, attackers, blockers, damage division, trigger order, scry and surveil, search, discard, mulligan, "you may", moving a commander to the command zone, the legend rule. The UI and the AI each implement one `Record<DecisionKind, Handler>`; the mapped type fails to compile when a kind has no handler.
- **Event pipeline.** Every state change goes through one pipeline: propose an event, apply replacement and prevention effects (CR 614 to 616, with a decision when the affected player must order them), commit, emit (A1). "Enters tapped", "enters with counters", "dies, exile instead", prevention, draw replacement and the commander replacement (CR 903.9b) are replacement effects on proposed events, never special cases in primitives. Emitted events are facts. The same stream drives trigger detection, the game log and the UI.
- **Casting is a transaction.** Starting to cast or activate stores a `CastingContext` (the steps of CR 601.2 as sub-decisions) and a snapshot of the pre-cast state; cancelling before payment and the "Handling Illegal Actions" rewind both restore the snapshot (A3).
- **Object identity (CR 400.7).** A card has a stable `cardId` and gets a fresh `objectId` every time it changes zones. Targets, attachments and "this permanent" point at objects, so a flickered creature is a new object and old references stop matching. Commander status belongs to the card.
- **Last-known information (CR 113.7a, 603.10).** The engine keeps the characteristics, controller, counters and attachments of an object as they were immediately before it left a zone; leaves-the-battlefield triggers are detected against the pre-event state and "its power" resolves through it (A4).
- **Hidden information.** `getView(state, seat)` returns only what that seat may know: no opponent hand contents, no library order, no face-down information. Agents receive views. For lookahead the host hands the agent a determinized sample (section 9, A31); the agent never reads the real state.
- **Determinism as a testing property.** All randomness (shuffles, coin flips, dice, random choices) comes from a seeded PRNG stored in state. A seed plus the action log reproduces a game exactly, which the tests rely on (`replayGame`, scenario 29). The seed is shown to the player. There is no player-facing save, load or replay (D-165).
- **Derived characteristics.** Power, toughness, abilities, types and colors are never stored as mutable fields; they are computed from base characteristics plus continuous effects through the layer system (CR 613).
- **Mana carries restrictions.** The pool holds typed mana objects: color or colorless, snow, source, and an optional spend restriction (A5). The payment planner is a pure engine helper shared by the UI's auto-pay and the AI, respects restrictions and empties restricted mana between steps.
- **Versions.** `ENGINE_VERSION` and `PARSER_VERSION` live in `packages/engine/src/version.ts`. Bump `PARSER_VERSION` whenever parsing or support changes, so cached support statuses are recomputed.

### 4.3 Card ability model

- Card behavior is data: a typed ability AST covering spell effects and activated, triggered, static, mana, loyalty and replacement abilities, built from a library of effect primitives combined with selectors, conditions, costs and durations. One interpreter executes the AST.
- Two routes produce the AST: the Oracle parser, and the engine's real-card fixtures (`packages/engine/src/cards/fixtures/`, hand-written ASTs of real cards, used as tests and as the hand-written route). There are no per-card override files and no community definitions (D-167). Card-specific data lives only in fixtures, never in engine code, and fixtures go through engine primitives.
- AI hints stay out of the AST: the AI reads the AST and the view, never card names.

## 5. Rules engine requirements

**Rules baseline:** the Comprehensive Rules effective September 25, 2026, plus the Mystery Booster Commander Edition Update Bulletin (October 19, 2026), applied by reference (D-035). The CR text and `RULES_VERSION.md` are in `docs/rules/`; `pnpm rule <number>` prints a rule. Rule numbers here come from the September 2026 file; the bulletin shifts meld to a new rule 713, so later 7xx numbers move: find rules by title. When this specification and the CR disagree, the CR wins; record the discrepancy in `docs/DECISIONS.md`. Cite rules in code as `CR 702.19b (Trample)`, number and title (A15).

### 5.1 Game setup (CR 103, 903)

- 40 starting life, 100-card singleton decks, commanders start in the command zone.
- The starting player is chosen randomly (seeded) and skips the draw on their first turn.
- London mulligan: draw 7, then bottom one card per mulligan taken. The free first mulligan of multiplayer (CR 103.5c) is a house-rule setting in 1v1 (`freeFirstMulligan`; the web app sets it from the menu or from `?freeMulligan=`).

### 5.2 Turn structure, priority and the stack (CR 117, 405, 500 to 514, 603, 608)

- Every phase and step, turn-based actions before priority, no priority in untap and normally cleanup. Spells and non-mana abilities use the stack, last in first out; the top object resolves when all players pass in succession.
- Before a player would receive priority, state-based actions repeat until none apply, then waiting triggers go on the stack in the two passes of CR 603.3b, each in APNAP order with the controller choosing the order.
- Mana pools empty at the end of every step and phase. Playing a land is a special action (once per turn plus extra-land effects, own main phase, empty stack).
- Cleanup: discard to maximum hand size, then remove damage and end "until end of turn" effects together; if anything triggers or state-based actions apply, players get priority and another cleanup step follows (CR 514.3a).

### 5.3 Casting and activating (CR 601, 602, 605, 606)

- The full sequence of CR 601.2 (move to the stack; modes, costs and X; targets; divisions; legality; total cost with commander tax; mana abilities; payment; the spell becomes cast), rewinding on an illegal step (CR 733, A3).
- Mana abilities (CR 605) do not use the stack; fetch lands are not mana abilities. Costs: generic, colored, `{C}`, hybrid, Phyrexian, snow, X, tap and untap symbols, life, sacrifice, discard, exile, removing counters.
- Summoning sickness (CR 302.6) stops attacking and `{T}` or `{Q}` abilities. Loyalty abilities: once per turn per permanent, at sorcery speed.

### 5.4 Targets (CR 115, 608.2b)

Legality is checked when chosen and on resolution. If every target is illegal the spell or ability fizzles; if only some are, it resolves for the rest.

### 5.5 Combat (CR 506 to 511)

- Attackers (summoning sickness, haste, defender, attack costs, vigilance) choose a player, planeswalker or battle. Blockers: flying, reach, menace, "can't be blocked", protection. A creature put onto the battlefield attacking after blockers is unblocked.
- **Damage assignment order no longer exists** (removed by the Foundations update, November 2024): an attacker blocked by several creatures divides its damage however its controller chooses (CR 510.1c). Lethal damage only matters for trample (CR 702.19b), and nonzero deathtouch damage is lethal (CR 702.2c).
- First strike and double strike add the first-strike damage step (CR 510.4). Lifelink, deathtouch, damage to planeswalkers and battles, and combat damage per commander.

### 5.6 State-based actions (CR 704)

Checked all at once, repeated until none apply: 0 life; drawing from an empty library; 10 poison; 21 combat damage from one commander; toughness 0; lethal or deathtouch damage unless indestructible; planeswalker with 0 loyalty; non-Siege battle with no defense; the legend rule; illegal Auras and Equipment; +1/+1 and -1/-1 counters cancel; tokens and spell copies outside their zones cease to exist; a commander in a graveyard or exile may move to the command zone (CR 903.9a). If every remaining player loses at once the game is a draw; a player who loses in a multi-seat game leaves it (CR 800.4a), and 1v1 uses the same rule (A14).

### 5.7 Continuous, replacement and prevention effects (CR 611 to 616)

Layers 1 to 7 with sublayers, timestamps and dependencies for the cases supported cards create. When several replacement effects apply, the affected player or controller chooses the order (CR 616). A commander that would go to hand or library may go to the command zone instead (CR 903.9b).

### 5.8 Commander-specific rules (CR 903)

- Deck validation: exactly 100 cards including the commander(s); singleton except basic lands and cards that allow more; every card within the commander's color identity (Scryfall `color_identity`); nothing banned (`legalities.commander`).
- Commander eligibility (CR 903.3): a legendary creature, a legendary Vehicle, a legendary Spacecraft with a power and toughness, or a card whose text says it can be your commander.
- Two commanders through the partner rules of CR 702.124 (partner, partner with, partner-[text], Background, Doctor's companion); color identities combine; the variants are implemented as the CR defines them, not from a hard-coded name list.
- Commander tax (CR 903.8): `{2}` more per previous cast from the command zone, per commander. "Your commander" effects and mana tied to commander color identity. Emblems live in the command zone.

### 5.9 Pitfalls checklist

- Mill, scry, surveil, investigate and proliferate are keyword actions, not keyword abilities. Ward is a triggered ability that uses the stack. "Unblockable" is not a keyword; the text is "can't be blocked".
- Indestructible prevents destruction (lethal damage, deathtouch, "destroy") but not toughness 0, sacrifice, exile or -X/-X. "Dies" means put into a graveyard from the battlefield, including the legend rule and sacrifice.
- A player who draws from an empty library partway through a spell lets the spell finish, then loses at the next state-based check.
- A permanent that changes zones loses its counters, damage, Auras and "until end of turn" effects.

## 6. Card data and deck import

### 6.1 Decklist parsing

- Accept Arena, MTGO, Moxfield and Archidekt exports: quantities (`1`, `1x`), exact names, set codes, collector numbers, foil and etched markers, category tags, `SB:` lines and section headers (`Commander`, `Deck`, `Sideboard`, `Companion`, `Maybeboard`). Extract quantity and exact name; normalize `/`, `//` and `///` separators and curly quotes.
- A small tokenizer with fixture tests for each format, not one regex. Unparseable lines are reported with their line numbers, never dropped.
- Commander detection: a `Commander` section or tag, otherwise the user picks among the eligible cards. Sideboard and maybeboard lines are shown but not played.

### 6.2 Scryfall

- **Headers.** Send `Accept: application/json` on every request. Browsers set their own `User-Agent`; Node tools must send a descriptive one such as `CommanderArena/<version> (+<repo URL>)`.
- **Rate limits.** `/cards/collection`, `/cards/named`, `/cards/search` and `/cards/random` allow 2 requests per second (500 ms apart); other API endpoints 10 per second; files on `*.scryfall.io` (images, bulk data) are not rate-limited. Every API call goes through one shared queue that enforces this; on HTTP 429, stop and back off.
- **Caching.** Cache results in IndexedDB for at least 24 hours.
- **Resolving names.** `POST /cards/collection` with at most 75 identifiers per request and `Content-Type: application/json`. Not-found cards are reported separately and results shift position, so match by name, not index. Retry unmatched names with `/cards/named?exact=`, then `?fuzzy=`, and ask the user to confirm a fuzzy match. Check field names and endpoint behavior against the live Scryfall documentation before relying on them; this document is not the API reference.
- **Fields stored per card:** identity and layout (`oracle_id`, `name`, `layout`, `card_faces`, `all_parts`); gameplay (`mana_cost`, `cmc`, `type_line`, `oracle_text`, `power`, `toughness`, `loyalty`, `defense`, `colors`, `color_identity`, `keywords`, `produced_mana`); `legalities.commander`, `edhrec_rank` and the optional `game_changer`; display (artist, `image_uris` or per-face `image_uris`: `normal`, `large`, `art_crop`).
- **Bulk data.** The `oracle_cards` bulk file (one entry per Oracle ID, refreshed every 12 hours) feeds the coverage tooling, precon snapshots and the golden corpus (`docs/CORPUS.md`). Rulings (`/cards/:id/rulings`, or the `rulings` bulk file) are read when researching a card, never bundled.
- **Tokens.** Resolve through `all_parts` where possible; otherwise synthesize from the Oracle text with a generic token frame.
- **Precons** ship with a pre-fetched card-data snapshot (`apps/web/src/precons/snapshots/`), so Quick start works when Scryfall is unreachable. Images still load from Scryfall. Apart from the golden corpus fixtures (`docs/CORPUS.md`), these snapshots are the only card data committed (A16).

## 7. Oracle text parser and card support status

### 7.1 Support status

Every card has exactly one status, computed with the current `PARSER_VERSION`:

- **supported**: every ability on every face is understood and the card's AST passes `validateAst` (A7): all selectors resolvable, every pronoun bound to an antecedent, every primitive and decision kind the AST needs implemented. The interpreter has no "not implemented" path: an interpreter error on a supported card is an engine bug, which the UI surfaces as a bug report with the seed, decklists and action log, treating the card as unsupported for the rest of that game.
- **unsupported**: anything else. The coverage report lists the exact text that was not understood and where the parser stopped.

There is no "partially supported". If one sentence cannot be parsed, the card is unsupported. "Covered by tests" means rule-level coverage (A8): every grammar rule ID and every primitive the AST uses has scenario tests and the curated AST snapshots stay green; it never means a test per card.

A deck that contains an unsupported card is invalid: the validation panel names the cards and "Play this deck" stays disabled (A29, D-056). The engine still drops text it does not understand rather than half-running it, which keeps hand-built and test decks safe; a banner before the first turn lists every card whose abilities were dropped (A28). Unsupported cards stay unsupported until a parser rule or engine primitive supports them (D-167).

### 7.2 Parser design

- Pipeline: Oracle text of each face, strip reminder text, normalize self-references (the full name, the short name of legendary cards, "this creature" and so on, `~`), split into abilities (keeping modal bullets together), match each against the grammar, emit the AST. The architecture is in `docs/design/parser-architecture.md` and `docs/ARCHITECTURE.md`.
- The grammar is a library of composable typed rules with stable IDs (for example `trigger.etb`, `effect.draw`), not a regex per card. A rule must consume the whole ability; leftover text makes the ability unparsed. On failure the parser reports the ability, the position, the closest rule and a reason (`unrecognised`, `notRunnable` or `unboundReference`, with the slot, the rules recognised and the engine features needed; A30, D-064). The coverage report depends on this diagnostic.
- Match current Oracle templating and include older wording in tests so the grammar tolerates both. Keywords use Scryfall's `keywords` array together with the keyword line, including parameterized keywords.
- Layouts: normal, split, adventure, transform, modal double-faced and Saga, plus Equipment, Auras and Vehicles. Any other layout (meld, flip, leveler, prototype, face-down mechanics and so on) is unsupported until implemented (face-down: `docs/proposals/face-down.md`).
- The mechanics and templates supported are listed per mechanic in `docs/MECHANICS.md` and by CR section in `docs/RULES_COVERAGE.md`.

### 7.3 Coverage tooling

- `pnpm coverage:cards` runs the parser over every Commander-legal card of the bulk file and writes `reports/coverage.md` (the supported share overall and of the top 500 and top 1,000 by `edhrec_rank`, and the commonest failures by grammar position), `reports/backlog.md` (unsupported mechanics and templates ranked by the popularity of the cards each would unlock) and `reports/templates.json`. `pnpm corpus:templates` plans the grammar from the template ranking (A21); `pnpm corpus:decks` reports per-deck coverage. The owner runs these where Scryfall is reachable (`docs/CORPUS.md`); numbers are never invented.
- AST snapshot tests cover a curated set of about 150 cards (staples plus tricky templating). CI fails if coverage drops (`--check` against `reports/coverage-baseline.json`).
- Target: at least 60% of the 500 most popular Commander cards supported; the actual number is reported at every milestone.

## 8. Card support: learning new mechanics

### 8.1 Goal

When a card cannot run, the coding agent analyses it, works out which capability is missing and adds it in the most general form that is correct, so the card works and so does every other card using the mechanic or template. The knowledge stays in the repository: grammar rules, primitives and keyword modules in the code; entries in `docs/MECHANICS.md`; lessons in `docs/CARD_SUPPORT_PLAYBOOK.md`. A card to support comes from the owner or from a GitHub issue (D-166).

### 8.2 In the app (removed)

The request dialog, "Request support" buttons, inbox, "Your requests" list, request files and `pnpm card:request` were removed (D-166), together with community definitions (D-167). The app keeps the import screen's coverage report and "Why unsupported?" view (the Oracle text, the parsed and unparsed parts, the parser's diagnostic). The `CardSupportRequest` schemas of A30 are gone with the pipeline.

### 8.3 Agent procedure and rules

The procedure is `docs/CARD_SUPPORT_PLAYBOOK.md`: intake, research (the card, its rulings, the CR rules, `docs/MECHANICS.md`, later Update Bulletins), diagnosis, an approval gate for subsystems, measuring impact over the bulk file, tests first, implementation, verification, recording, report. Gaps are classified at the lowest level that fixes them correctly: **T** template (the grammar does not recognize a wording), **P** primitive (a new effect, selector, condition, cost or duration), **K** keyword, **S** subsystem (new engine machinery: a layout, face-down permanents, phasing, day and night, the monarch, voting, extra turns, a new decision kind that changes existing flows). An **S** gap needs a proposal in `docs/proposals/` and the owner's approval first. The former class O (one-off override) has no route any more: such a card stays unsupported (D-167).

Rules for the loop, still binding:

- Never mark a card supported without tests.
- Never special-case a card by name inside engine code.
- Never weaken an existing rule implementation to make a new card fit.
- If the CR and a Scryfall ruling seem to disagree, follow the CR and note it in `docs/DECISIONS.md`.

### 8.4 What the owner types (removed)

The player-facing request phrases were removed with the pipeline. The owner asks in chat or opens an issue ("add support for <card>", "work the backlog", "approve the proposal in docs/proposals/<mechanic>.md"); `README.md` says how to request support.

## 9. AI opponents

- **Interface.** `Agent.decide(view, decision, ctx) → Action`, async, with `ctx.budgetMs`, an injected clock `ctx.now` and an optional `ctx.sample(seed)` (`packages/ai/src/agent.ts`). Agents: `RandomLegalAgent` (tests), `CasualAgent` (the former web opponent, kept for tests and `?ai=casual`), `GreedyAgent` (the benchmark: a land every turn, the most expensive castable spells, attacks that survive, blocks only against lethal; A11), and **`HeuristicAgent`**, the one opponent of the product (D-163, D-164, D-168). A search-based agent can be added later without engine changes.
- **What it may know (A31, D-161).** The AI receives views and never reads hidden information. It may know the opponent's initial decklist and every card revealed in play; it never knows a hand or the order of a library. To look ahead, the host holds the real state and hands the agent a sample: `determinize(state, viewer, rng) → GameState` re-draws everything the viewer cannot know with the AI's own PRNG (other seats' hands, libraries and face-down exile pooled and dealt back into the same slots, every library reordered except what the viewer may see, the real seed and PRNG replaced). The sample never reveals or advances the real game's PRNG.
- **HeuristicAgent behavior.** It plays blocks and attacks out on the sample with the engine and scores the result with the board evaluator, including lethal and crack-back checks and poison and commander damage as danger; plans mana (the set of spells that uses the most, the land that enables the best, holding the land drop when it is better); aims removal with "do not waste it" filters, the opposing commander first among near-equals, with a stable tie-break; holds instant-speed plays for named windows (after blockers, the opponent's end step, in response); keeps or sends back its opening hand by land count and curve. Every decision kind it does not take over goes to the casual handlers, so it handles every kind and cannot deadlock. Every decision carries a reason code. The module comments of `packages/ai/src/heuristic-*.ts` hold the rules; `docs/PRIOR_ART.md` 7.2 holds the ranked heuristics it implements.
- **Safety.** If a handler throws, the agent falls back to a safe legal choice and records it; tests treat any fallback as a failure. The Worker enforces the time budget: a decision that exceeds it by a configurable margin is replaced with the safe fallback and logged (A28).
- **Time budget:** at most 5 seconds per decision on a mid-range laptop (raised from 1 second in D-172: a person takes minutes a turn, so the wait costs nothing, and a bigger budget lets the search score more plays on big boards and on slower devices); a search stops at 60% of the budget and takes the best candidate so far. A short, configurable delay lets humans follow the plays. There is one level (D-168); the web app always plays `HeuristicAgent`, and `?ai=casual|normal` exists for tests.
- **Benchmark (A11, M7).** `HeuristicAgent` beats `GreedyAgent` in at least 70% of 200 games and `RandomLegalAgent` in at least 95%, and mirrored self-play lands between 40% and 60% per seat, measured with `pnpm ai:arena` on paired seeds with seats swapped (numbers: `docs/progress/M7.md`).
- **v2:** threat assessment across opponents, attack distribution, targeting across the table, search over determinized states.

## 10. UI and UX (layout inspired by Arena, original visuals)

- **Board.** Opponent at the top, human at the bottom, rows for lands, creatures and other permanents. Each player has a command zone showing commanders, tax and commander damage taken; life totals; hand, library, graveyard and exile counts. Two side columns: the card preview and the log on the left; the stack, the action dock and Settings on the right.
- **Cards.** Scryfall images; the battlefield may use `art_crop` tiles with a name and power/toughness frame. Overlays show current power and toughness (highlighted when modified), counters, damage, keyword icons, summoning sickness, tapped, attacking or blocking, and the unsupported badge. Playable cards glow, from `getLegalActions`.
- **Readability and dense boards (A19).** Hovering a card for about 150 ms shows it full size in a fixed preview panel, never a cursor-following tooltip, as it is now (current power and toughness with a "modified" marker, counters, damage, granted and lost abilities, both faces, attachments); right-click pins it, Esc unpins; the panel also serves the log, the stack and zone viewers. The hand fans at a size legible at 1366 by 768. A row shrinks its tiles as it fills, then groups identical tokens (same name, characteristics, tapped state, counters, attachments) into one tile with a count badge, never nontoken permanents, then scrolls. The land row stacks equal lands (same name, token or card, counters, chosen color or type and control effect; a land with an Aura stands alone) in columns of up to five, as deep as the row height allows, ordered Plains, Island, Swamp, Mountain, Forest, Wastes, then nonbasic lands by name; tapping never moves a card (A33). Once blocks are declared, the creatures in blocks stand first in their rows in the order of their attackers, with an arrow from each blocker to the attacker it blocks (also while the player picks); nothing moves while the player is still picking (A34).
- **Stack panel** with arrows from each object to its targets. When nothing is pinned or hovered the preview panel shows the object on top of the stack, flagged "Top of the stack"; an object that lands on top takes the panel even while the pointer rests on a card, and a pin stays. An announced X is written into the words of the stack item and the rules text of the preview ("Deals X (3) damage"), and the log says what resolved (A32). **Action bar:** one context-sensitive button (Pass, Resolve, To Combat, Attack, No Blocks, Next, End Turn), Pass Turn, Full Control, per-step stops, Undo of small actions; declaring attackers offers "Attack with all" and "Declare attackers (N)" on one line (A34). While the AI decides, the page shows an "opponent is thinking" status in the dock (D-174).
- **Auto-pass (A18, D-018, D-045, D-138).** A pure, tested `shouldStop(view, settings)` in `apps/web`, not the engine, decides; every auto-pass is an ordinary pass action. The human clicks only for a real decision: a pending non-priority decision, or an instant-speed spell or non-mana ability they can fully pay for. Default stops: on their turn, precombat main, declare attackers (if a creature can attack) and postcombat main; on the opponent's, declare blockers if attacked, any stack object while they hold a relevant action, and any spell of the opponent, so the player can read it before it resolves (the Settings checkbox "Stop for opponent spells", on by default; the opponent's abilities stop only for a relevant action or when aimed at the player, A32). Other resolutions pass automatically while the player holds no relevant action (still animated and logged; the "Passing" indicator seizes priority). Stops are per step, for this turn or every turn; Full Control stops at every priority point and holds priority after casting. Identical triggers are auto-ordered; optional triggers and costs offer per-card "always yes" and "always no" for the game. Auto-pay is the default and manual tapping a mode. When in doubt the policy stops: it never ends the last chance to act on a response window for a relevant action.
- **Decisions.** Targeting highlights only legal targets; attacks and blocks by click or drag with only legal assignments; while blocking, a "Damage getting through" panel shows what each defender takes (the life left, the sources, a "Lethal" mark), updated with every pick; it is plain combat damage, and first strike killing a blocker early, prevention and tricks are not simulated (the panel says so, the engine stays the judge); damage division only when there is a real choice, as a panel docked in the controls column with the card face of each creature, not a modal (A34); choosers for modes and X, search, scry and surveil ordering, trigger ordering, mulligan. Auto-pay keeps the colors other cards in hand need and prefers lands over creatures over sacrificing Treasures. Every decision kind has a UI handler.
- **Information and accessibility.** A filterable log, zone viewers for graveyards, exile and the command zone, skippable event-driven animation that never blocks the engine (combat animations, A34: a floating damage number, a flash and shake on a permanent that took damage, a fading name card for one that died; visual only, on by default, off with the Settings checkbox "Combat animations" and not drawn under reduced motion), keyboard shortcuts (Space to pass or confirm, Esc to cancel, P to pass the turn, F for Full Control), a minimum layout of 1366 by 768, readable contrast, a theme toggle and a text size setting.
- **Screens.** The menu (Quick start) with a picker for each seat, the shipped precons then "Saved in this browser" (a saved deck needs a connection unless its cards are cached, and a deck the engine cannot run is refused with the reason), the seed and the house-rule setting, and a footer line with the build, engine and card parser versions (A33); deck import with validation errors, the coverage report and "Why unsupported?", ending in a note that says the deck is ready to save and play from the menu or what stops it (no play button: a deck is saved there and played from the menu, A34); the decks page, which lists the saved decks and the shipped precons ("Built in" or "Edited by you"), each precon editable and saved locally in the browser with "Reset to default" (A33); Settings (stops, theme, text size, side of the stack, combat animations, Concede); the game; game over. There is no requests list, definitions tab, save, load or replay screen.
- **Manual adjustments (A25).** Not built. If they are, each is an ordinary action through `applyAction`, marked as manual in the logs.
- **v2 layout:** up to five opponents around the top and sides, a compact mode and a way to focus on one opponent.

## 11. Legal and API etiquette

- This is an unofficial, free fan project. Show the Wizards of the Coast Fan Content Policy notice. Use no WotC or MTG Arena logos, UI assets or trade dress; the visuals are original and only the layout is inspired by Arena.
- Follow Scryfall's image guidelines: do not crop or cover the artist name or copyright line, and do not distort, color-shift or watermark images. When showing `art_crop`, make the artist and the full card available in the same interface (hover zoom satisfies this). Put power, toughness and counter badges outside the image or on the art-crop tile frame, never over the copyright line.
- Credit Scryfall as the data source.
- The code is MIT-licensed (`LICENSE`, A16). Card data and images remain the property of Wizards of the Coast and are served from Scryfall, never committed, except the precon card-data snapshots and the golden corpus fixtures (6.2). Do not copy code or data from GPL, AGPL or noncommercial projects (`docs/PRIOR_ART.md`).

## 12. Quality bar and tests

- `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass at every milestone, enforced by CI. The commands and what to run while working are in `AGENTS.md`.
- **No stubs in supported paths.** Code reachable from supported features has no TODO placeholders, fake return values or "simplified" logic. Deferred work goes in `docs/ROADMAP.md`. Anything unsupported is detected and flagged, never silently skipped.
- **Performance budgets:** `applyAction` under 5 ms and `getLegalActions` under 20 ms in typical board states; AI decisions within 5 s (D-172); animations at 60 fps. Not yet verified as a whole (`docs/STATUS.md`).
- **Scenario tests** use the scenario DSL (`@commander-arena/engine/testing`, A12): a builder that writes a precise state, drives everything through `applyAction` and asserts. Every scenario test, and every test written for card support, uses it.

### Required scenario tests

Each is a headless engine test that sets up a precise state. Add many more as you go. The numbers are cited from code and documents and stay fixed.

1. **Hexproof in response:** Lightning Bolt targets a creature; its controller responds by giving it hexproof. Bolt does not resolve and goes to the graveyard.
2. **Partial fizzle:** a spell with two targets, one becoming illegal, still resolves for the other and performs its untargeted parts (such as "draw a card"). If both are illegal, nothing happens, including the draw.
3. **Object identity:** a creature targeted by removal is flickered in response. The removal does not resolve, and the returned creature is a new object without its old counters, damage or Auras.
4. **Double block:** a 3/3 attacker blocked by two 2/2s may put all 3 damage on one blocker.
5. **Trample and deathtouch:** a 4/4 with trample and deathtouch blocked by a 5/5 may assign 1 damage to the blocker and 3 to the player.
6. **First and double strike:** a 2/2 first striker blocked by a 2/2 kills it in the first-strike step and takes no damage. An unblocked 3/3 with double strike and lifelink deals 6 and gains 6 over two damage steps.
7. **Evasion:** menace cannot be blocked by one creature; flying only by flying or reach.
8. **Summoning sickness:** a mana creature that entered this turn cannot tap for mana unless it has haste.
9. **Mana:** mana abilities activate during cost payment without the stack, and unspent mana empties between steps.
10. **Land timing:** a land cannot be played in combat, with a non-empty stack or on the opponent's turn; a second land in a turn is rejected without an extra-land effect.
11. **Enters tapped:** a land that enters tapped cannot produce mana that turn unless an effect untaps it.
12. **Simultaneous SBAs:** two creatures with lethal damage and a player at 0 life are handled in one check; if both players reach 0 life at once, the game is a draw.
13. **Empty library:** drawing past the end partway through a spell lets the spell finish (a later "gain 5 life" happens), then the player loses at the next check.
14. **Legend rule:** a copy effect creates a second legendary permanent with the same name; the controller chooses which to keep and the other triggers "dies".
15. **Counters:** +1/+1 and -1/-1 counters on the same creature cancel.
16. **Indestructible:** survives lethal damage and "destroy", but goes to the graveyard at toughness 0 and can be sacrificed.
17. **Layers:** a 2/2 with a +1/+1 counter gets Giant Growth, then Turn to Frog: a 5/5 Frog with no abilities (base 1/1 in layer 7b; Giant Growth and the counter in 7c).
18. **Trigger ordering:** two of your "enters" triggers go on the stack in the order you choose; with both players holding triggers, the active player's go first, so the other player's resolve first.
19. **Ward:** targeting a permanent with ward {2} triggers ward, and the spell is countered unless its controller pays {2}.
20. **Prowess:** casting a noncreature spell triggers prowess, and the trigger resolves before the spell.
21. **Commander zone changes:** a destroyed commander may go to the command zone (state-based action); a bounced one may go instead of hand (replacement); a countered one goes to the graveyard and may then move.
22. **Commander tax:** the second cast from the command zone costs {2} more, the third {4}; from hand, no tax.
23. **Commander damage:** 21 combat damage from one commander, across turns and trips to the command zone, loses even with life remaining; two different commanders do not add.
24. **Cleanup:** with 9 cards in hand the player discards 2; "until end of turn" effects and damage end; a trigger during cleanup gives priority and another cleanup step follows.
25. **Fetch land:** its ability uses the stack and can be responded to; the library is shuffled after the search.
26. **Deck validation:** rejects a 99-card deck, an off-identity card, two copies of a non-basic and a banned card; accepts cards that allow any number of copies, legal partner pairs and a legendary Vehicle as commander.
27. **Import formats:** each export-format fixture parses to the same canonical deck; unparseable lines are reported with line numbers.
28. **Hidden information:** the AI's view never contains the opponent's hand contents or library order, and a sample never contains the hidden truth.
29. **Determinism:** the same seed and action log produce the same final state hash.
30. **Support requests (removed, D-166):** this test covered the request file and its schema. The remaining half, that cached support statuses are recomputed when `PARSER_VERSION` changes, stays required.

### Property and soak tests

- Property tests (fast-check) on random games with `RandomLegalAgent`: each owner's card count is conserved across zones (tokens aside); no negative counts; every `PendingDecision` has a legal option or an explicit "none"; games end within a turn cap; replays are deterministic.
- Soak tests: AI-vs-AI games on the precons and random seeds finish with no exceptions, deadlocks, rejected actions or AI fallbacks. Routine runs are small, the nightly routine and `pnpm test:soak` larger, and the manual `Soak` workflow plays 500 before a milestone report (A13, D-126, D-132).
- Browser tests (Playwright): start a game against a precon, play turns by clicking, check the log and state; and the auto-pass test of A18, in which the opponent casts three spells while the human holds only sorcery-speed cards and the human clicks at most once per phase with a stop and never during the opponent's turn.

## 13. Repository documents

Together with the code, these are the project's long-term memory: a future session with no chat history should be able to continue from them alone. `AGENTS.md` lists when each is updated.

| Path | Purpose |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | Standing instructions for any coding agent (setup, commands, codebase rules). `CLAUDE.md` imports `AGENTS.md`. |
| `docs/SPEC.md` | This document. Changed only with the owner's approval. |
| `docs/STATUS.md`, `docs/progress/M<n>.md` | The handoff file (current state, next steps, how to run) and the per-milestone reports (A22). |
| `docs/ARCHITECTURE.md` | Module map, state model, data flow; real and planned kept apart. |
| `docs/DECISIONS.md` | Decision log, one entry per decision (template at its top). |
| `docs/rules/` | The CR text, `RULES_VERSION.md` and bulletins. |
| `docs/RULES_COVERAGE.md`, `docs/MECHANICS.md` | Rules support by CR section; the per-mechanic catalogue, read before adding anything. |
| `docs/CARD_SUPPORT_PLAYBOOK.md` | The procedure of 8.3 and its lessons learned. |
| `docs/ROADMAP.md` | Deferred work and known limitations. |
| `docs/CORPUS.md`, `reports/` | The corpus and coverage tooling and its generated reports. |
| `docs/design/`, `docs/proposals/` | Implemented design proposals; proposals awaiting approval. |
| `docs/PRIOR_ART.md` | Other projects studied, with the license limits on reuse. |
| `README.md` | How to run, how to request card support, known limitations, credits and the Fan Content Policy notice. |

## 14. How to work

- Work milestone by milestone. At the end of each: all checks pass, documents are updated, a short report goes in `docs/progress/M<n>.md` (what is done, test status, coverage numbers, known gaps, decisions), and the work is committed on its branch.
- Stop for the owner's review at checkpoints and for S-class proposals; otherwise make the most reasonable decision consistent with the CR and this specification, record it in `docs/DECISIONS.md` and continue.
- When unsure about a rule, look it up with `pnpm rule` instead of relying on memory, then add a test that pins the behavior.
- Prefer small, well-named modules, under about 400 lines where practical.

## 15. Milestones

| # | Milestone | Status |
|---|---|---|
| M0 | Foundations: monorepo, tooling, CI, boundary lint rule, documents, CR text | Done (`docs/progress/M0.md`) |
| M1 | Engine core, headless: state, zones, identity, seeded RNG, turns, priority, stack, SBAs, mana, payment planner, mulligan, commander setup and tax; the scenario DSL | Done (`docs/progress/M1.md`) |
| M2 | Combat: all steps, combat keywords, damage division, planeswalkers and battles as attack targets, commander damage | Done (`docs/progress/M2.md`) |
| M3 | First playable: the web UI on the Worker architecture, a full 1v1 game, static deploy | Done (`docs/progress/M3.md`) |
| M4 | Card data and deck import: decklist parser, Scryfall client and queue, cache, validation, commander selection, coverage report, "Why unsupported?", versioned support status | Done (`docs/progress/M4.md`) |
| M5 | The ability system: AST and interpreter, triggered, activated and static abilities, layers, replacement and prevention, targeting, keywords, tokens, Equipment, Auras, Vehicles, the multi-face layouts, `docs/MECHANICS.md` | Done (`docs/progress/M5.md`) |
| M6 | Oracle parser growth, coverage tooling, the card support procedure and playbook | Done (`docs/progress/M6.md`) |
| M7 | The stronger AI: `determinize`, evaluator, `GreedyAgent`, `HeuristicAgent`, `pnpm ai:arena`, property and soak tests | Done (`docs/progress/M7.md`) |
| M8 | The full Arena-style UI (section 10) | Built as slices together with the M9 track (D-138 to D-153); no separate report |
| M9 | v1 complete: precons built from supported cards with snapshots; performance budgets; README complete | Precons done (D-137 and the card slices); leftovers: the performance budgets (12) and the README pass (`docs/STATUS.md`). Save and resume, replay export and import, and the three-card support-loop exercise were removed (D-165, D-166, D-167) |
| M10, M11 | v2: the multiplayer engine, then the multiplayer UI and AI | Not started (`docs/ROADMAP.md`) |

## 16. Definition of done for v1

- A user can paste a 100-card Commander list, see validation results and the coverage report, pick a precon or a valid imported deck, and play a full game to completion in the browser with no backend.
- All checks pass, every required scenario test passes, and the soak tests are clean.
- The coverage target is met, or the actual number and the main gaps are reported.
- Every document in section 13 exists and is current, and the README lists known limitations.
- The app runs locally with `pnpm dev` and builds to a static site with `pnpm build`.

## 17. Amendments index

Thirty-four amendments (A1 to A34) were approved by the owner between 2026-10-20 and 2026-11-08. Their text is not kept: each line says what the amendment decided and where it now lives, or which decision removed or superseded it. Where an amendment disagreed with an earlier section, the amendment won; the sections above already include the result. The full reasoning is in `docs/DECISIONS.md` under the D-number shown.

### 17.1 Engine architecture

- **A1** (D-001): two-phase event pipeline, propose then replace then commit then emit. Now in 4.2.
- **A2** (D-002): priority is a decision kind; one pending decision for one seat; one handler record per kind. Now in 4.2.
- **A3** (D-003): casting is a transaction with a snapshot; the only rewind mechanism. Now in 4.2 and 5.3.
- **A4** (D-004): last-known information as an engine feature. Now in 4.2.
- **A5** (D-005): mana carries spend restrictions. Now in 4.2.
- **A6** (D-006): immutable updates with structural sharing, derived characteristics cached per state version. Now in 4.2 and 12.

### 17.2 Parser and support status

- **A7** (D-007): "supported" is a runtime guarantee, `validateAst`. Now in 7.1.
- **A8** (D-008): "covered by tests" means per grammar rule and primitive, not per card. Now in 7.1.
- **A9** (D-009): the AST, validation and diagnostic format are defined in M1, the parser framework in M4, the interpreter in M5, the grammar growth in M6. Milestone order only; now in 15.

### 17.3 AI and testing

- **A10** (D-010): `determinize` for the AI, no hidden-information search in v1. Amended by A31; now in 9.
- **A11** (D-011): the `GreedyAgent` benchmark and the M7 win-rate criteria. Now in 9.
- **A12** (D-012): the scenario DSL. Now in 12.
- **A13** (D-013): soak test split between pull requests, nightly and manual runs. Now in 12; sizes superseded by D-126 and D-132.

### 17.4 Smaller amendments

- **A14** (D-014): game end for any seat count. Now in 5.6.
- **A15** (D-015): cite rules by number and title. Now in 5.
- **A16** (D-016): MIT license; card data and images not committed except precon snapshots and corpus fixtures. Now in 6.2 and 11.
- **A17** (D-017): verify the rules baseline in M0. Done in M0 (D-035); the baseline is in 5.

### 17.5 UX flow

- **A18** (D-018): the auto-pass policy and `shouldStop`. Now in 10 (details superseded in part by D-045, D-075, D-138, D-143).
- **A19** (D-019): fixed preview panel, hand fan, dense-board grouping. Now in 10.
- **A32** (D-199, PR #114): stop for every opponent spell, the top of the stack in the preview panel, the announced X in the text, the log names what resolved. Now in 10 (extends A18).
- **A33** (D-215, PR #118): saved decks for either seat, precons editable on the decks page, the version line on the start screen, equal lands stacked in columns. Now in 10.
- **A34** (D-226, PR #124): the damage getting through panel, the damage division as a docked panel, blockers beside their attackers with arrows, the attack buttons, no play box on the import screen, combat animations and their Settings switch. Now in 10.

### 17.6 Preparation and process

- **A20** (D-020): M0 spikes for external assumptions. Done in M0; the spike scripts were removed.
- **A21** (D-021): corpus-driven grammar planning. Now in 7.3.
- **A22** (D-022): `docs/STATUS.md` and `docs/progress/`. Now in 13.
- **A23** (D-023): static deploy from M3. Superseded by D-049.
- **A24** (D-024): `pnpm rule`. Now in 5 and `AGENTS.md`.
- **A25** (D-025): manual adjustments are actions. Now in 4.2 and 10; not built.
- **A26** (D-026): saves and replays as seed plus action log. Removed by D-165; the seed and log stay as a test tool (4.2).
- **A27** (D-027): real cards as the test set. Now in 4.3 (the engine's real-card fixtures).
- **A28** (D-028): honesty summary, concede, the AI watchdog. Now in 7.1, 9 and 10.
- **A29** (D-056): a deck with an unsupported card is not playable. Now in 7.1.
- **A30** (D-064): `CardSupportRequest` schema 2 and the diagnostic fields. The request schema was removed by D-166; the diagnostic fields live on in the parser (7.2).
- **A31** (D-161): the AI may know the opponent's initial decklist and revealed cards, never a hand or a library order; `determinize(state, viewer, rng)` runs on the host. Now in 9.

### 17.7 Stack choices made before M0 (D-029)

Recorded so later sessions do not reopen them; deviations need a new `D-` entry. Biome and dependency-cruiser; React 19 with Vite, Zustand and Comlink; Zod schemas for serialized data; one pull request per milestone, merged after the checks pass. Now in 4.1.

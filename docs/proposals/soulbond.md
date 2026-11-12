# Proposal: soulbond and pairing (S-class, waits for the owner's approval)

Written for issue 5 (the Bruna deck), which needs it for Breathkeeper Seraph. Nothing of it is built. The rule text below was read with `pnpm rule` from the CR copy of the owner's private rules repository (CR effective September 25, 2026, `docs/rules/RULES_VERSION.md`); what is quoted is quoted from that text, the rest is paraphrase with the rule number. The card text is the issue author's, as stored in the golden corpus (not checked against Scryfall). Facts about the engine were read in the code at the base of `support-bruna` (`ENGINE_VERSION` 76, `PARSER_VERSION` 82); the numbers move, check them when building.

What the owner decided earlier and still applies here: card data comes from Scryfall and nothing is invented or hard-coded (the instruction recorded in `docs/proposals/meld.md`); no card-name special cases in engine code (AGENTS.md); a card the engine does not fully understand is flagged, never guessed. The owner has approved nothing about soulbond yet.

## The card, and what blocks it today

Breathkeeper Seraph ({4}{W}{W}, Creature, Angel, 4/4), Oracle text from `packages/cards/test/fixtures/corpus/golden.jsonl`:

- "Flying, soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)"
- "As long as Breathkeeper Seraph is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner's control at the beginning of your next upkeep.""

`golden.expected.json` marks it `unsupported`; the first unparsed ability is the line "Flying, soulbond" (reason `unrecognised`, slot `keyword`, closest rule `keyword.line`). The second line is not reported separately because the card fails at the first. So three things are missing, and only the first is S-class:

1. **Soulbond and pairing** (this proposal, S): a link between two creatures that the engine does not have.
2. **"As long as ~ is paired with another creature, each of those creatures has "..."** (P): a condition on the link and a static grant whose subject is "this creature and the one it is paired with". The grant of an ability to a group exists (`StaticEffect` `grantAbility`, `StaticSubject`), the subject and the condition are new.
3. **The granted ability itself** (P, independent of pairing, can be built and tested first): "When this creature dies, you may return it to the battlefield under its owner's control at the beginning of your next upkeep". `validateCard` today allows a delayed triggered ability to move an object only when it is the `moved` of an exile earlier in the same sequence (D-205, `ast/validate-later.ts`), and otherwise only player-only effects with fixed amounts. Here the object is the card the dying creature became (`triggerCard`, D-230, CR 400.7, 603.10a), found when the delayed ability is created and looked at again when it resolves (CR 603.7c). That is a small extension of `checkDelayedTrigger` plus an `optional` ("you may") around the creation, and a `D-` entry; it needs no pairing.

How many cards need the keyword: `reports/templates.json` (the owner's run over the bulk file of 2026-10-22, parser version 62) lists the template "Soulbond" with 24 cards and none of them blocked by that line alone (`soloCards` 0: each has a second line too). The list keeps the top 1000 shapes, so the second lines of most of them are not in it; one is, "As long as ~ is paired with another creature, each of those creatures has "{M}: Exile ~, then return it to the battlefield under your control."" (Deadeye Navigator, one card). Which of the 24 would be fully supported after this slice is not measured here; the owner's `pnpm coverage:cards` run after the build would show it. (From memory, UNVERIFIED and not fetched: the usual second line is "As long as ~ is paired with another creature, both creatures have [a keyword]" or "get +N/+N", which is the same condition and subject as Breathkeeper's with a different grant.)

## Rules (read with `pnpm rule 702.95` and the rules it points to)

- CR 702.95a (Soulbond): "Soulbond is a keyword that represents two triggered abilities. "Soulbond" means "When this creature enters, if you control both this creature and another creature and both are unpaired, you may pair this creature with another unpaired creature you control for as long as both remain creatures on the battlefield under your control" and "Whenever another creature you control enters, if you control both that creature and this one and both are unpaired, you may pair that creature with this creature for as long as both remain creatures on the battlefield under your control.""
- CR 702.95b: a creature becomes "paired" with another as the result of a soulbond ability; abilities may refer to a paired creature, to the creature another creature is paired with, or to whether a creature is paired; an "unpaired" creature is one that is not paired. The glossary has the entry Paired.
- CR 702.95c: when the soulbond ability resolves, if either object that would be paired is no longer a creature, no longer on the battlefield, or no longer under the control of the player who controls the soulbond ability, neither object becomes paired.
- CR 702.95d: a creature can be paired with only one other creature.
- CR 702.95e: a paired creature becomes unpaired if another player gains control of it or of the creature it is paired with, if it or its partner stops being a creature, or if it or its partner leaves the battlefield.
- CR 603.4 (intervening "if"): the condition is checked when the event occurs, and again as the ability resolves; if false then, the ability does nothing. 702.95a's "if you control both ... and both are unpaired" is such a clause.
- CR 603.5: an optional triggered ability goes on the stack regardless; the choice is made as it resolves. CR 608.2d: choices an effect offers are announced while applying the effect. 702.95a has no "target": the partner is chosen on resolution, so hexproof and protection do not matter and nothing is chosen as the ability goes on the stack.
- CR 603.6a: each time an event puts one or more permanents onto the battlefield, all permanents on the battlefield (including the newcomers) are checked for enters triggers. So several creatures entering together, or the soulbond creature entering with others, each trigger what they should.
- CR 400.7: an object that changes zone is a new object with no memory of its past. So a pair never survives either creature leaving, which is also what 702.95e says, and a creature that returns is unpaired.
- CR 611.3a to 611.3c: a continuous effect of a static ability is not locked in, applies at any moment to what its text says, and applies as long as the object generating it is on the battlefield. CR 613.1f: adding an ability is layer 6. CR 613.7a: the effect of a static ability has the timestamp of its object.
- CR 702.26b, 702.26d: a phased-out permanent is treated as though it does not exist, but phasing is not a zone change or a change of control. 702.95e does not name phasing; see the open questions.
- CR 603.7a to 603.7c: the delayed triggered ability of the card's second line is created as the dies ability resolves, triggers only once, and affects the object only if it is still in the zone it is expected to be in.

## What a pairing is as game state

A pairing is a symmetric link between two creatures on the battlefield that one player controls. It belongs to the permanents, like the Ring-bearer designation (D-196) and a Saga's counters, not to a player and not to the soulbond card: a pair can be formed by the ability of one creature while the grant that matters belongs to another.

- **Stored where.** An optional field on both objects, `GameObject.paired?: { readonly with: ObjectId; readonly by: SeatId }`: the other creature and the player who formed the pair (the controller of the soulbond ability, which 702.95c and 702.95e compare against). Absent unless paired, so the saved or digested state of a game with no pair is byte-for-byte the same (the shape of `ringBearer`, `level`, `citysBlessing`, D-264). It is a designation, not a copiable value: a copy effect does not copy it, a token that copies a paired creature is unpaired, and every new object after a zone change has none (CR 400.7, 702.95e).
- **Reading.** One module, `rules/pairing.ts`, with the readers: `partnerOf(state, obj)` returns the partner only when the link is valid now, meaning the partner object exists, is on the battlefield (not phased out, see below), points back at `obj`, both are controlled (`controllerOf`, D-189, never the raw field) by `by`. A link that fails any of these reads as "unpaired" at once. So derive, the conditions, the view and the legal actions never see a stale pair, even between the moment a creature leaves and the next cleanup. The module imports no `derive`, so `derive` can use it (the shape of `rules/ring-bearer.ts` and `rules/designations.ts`).
- **Dropped when.** Two ways, matching 702.95e and the engine's habit (D-196, D-264): (a) the reads above make every cause except "stops being a creature" take effect immediately: the partner left or became a new object, or control changed; (b) a step in `checkStateBasedActions`, with the Ring-bearer and city's blessing checks (`rules/sba.ts`, an early return with `performed: true` so the next pass starts from the new state), clears the stored field on both objects and emits an event, and is the one place that reads `derive` for "is it still a creature" (CR 613.1d: type-changing effects). Reading the type inside a layer 6 condition would be circular (the condition decides a grant, the grant could decide the type), so the condition reads only (a) and the creature test waits for the pass: between a creature losing its types and the next pass (inside one resolution) a grant of the pair still applies. That is a known approximation, to be recorded in `docs/ROADMAP.md`, of the same kind as D-264's. CR 704 does not list this as a state-based action; doing it in that pass is the engine's own choice, as for Ascend.
- **Never replaced by a new pair.** The task's wording "or the pair is formed again" does not match the CR text I read: a creature can be paired with only one creature (702.95d) and both soulbond triggers carry "both are unpaired" as an intervening "if" (702.95a, 603.4), so a second pairing cannot form while the first stands. With two soulbond abilities on the stack for the same creatures, the first to resolve pairs them and the second finds them paired as it resolves and does nothing. The engine must make that check as the ability resolves (603.4) and the 702.95c checks too, and never overwrite a link.
- **Invariants** (`invariants.ts`): every link is symmetric (`a.paired.with === b.id` and back), has the same `by` on both sides, and both objects exist; and, only when no decision is pending (a destroy effect inside one resolution can leave a stale id until the next priority point, which the readers above already ignore), both are on the battlefield and creatures under `by`'s control. A pair in which either is a token is legal.

## The two triggers

The keyword is data, `{ kind: 'soulbond' }`, printed only (not grantable, refused by `validateCard` when granted; the shape of `ascend`, D-264) and a supported feature `keyword:soulbond`. `derive-keywords.ts` expands it into the two triggered abilities of 702.95a, as it does for exalted and extort. The abilities are the engine's own and no card carries them:

1. Trigger `entersBattlefield` with `what: this`, `interveningIf: { kind: 'soulbondReady', with: 'another' }` (internal): this creature is unpaired, you control it, and you control another creature that is unpaired. Effect `{ kind: 'pair', partner: 'choose' }`.
2. Trigger `entersBattlefield` with `what` a creature filter (controlled by you, `other`), `interveningIf: { kind: 'soulbondReady', with: 'triggerSubject' }`: this and the entering creature are unpaired and both are yours. Effect `{ kind: 'pair', partner: 'triggerSubject' }`.

Both are not `optional`: the "you may" is the choice inside `pair` (see decisions), so the player is not asked twice. The internal condition and effect are refused by `validateCard` in card data (the way `castExiled` and `removeTimeCounter` are, D-128). The `pair` effect, as it resolves, re-checks the whole of 702.95c and 702.95d against the state now: both objects are the same ones, creatures by `derive`, on the battlefield, controlled by the player who controls the ability, and unpaired; if anything fails, nobody is paired. Then it sets the link on both objects and emits `creaturesPaired { a, b, by }`.

Questions of order that follow from CR 603.3b and 603.6a and need tests rather than new code: with two unpaired soulbond creatures and another creature entering, the controller gets two triggers and orders them (`orderTriggers`, existing); a soulbond creature that enters together with other creatures triggers its own ability and one trigger per other entering creature that is hers; a creature entering under an opponent's control triggers nothing of yours (the filter says "you control").

## Static grants: "as long as paired"

- **Condition.** A public `Condition` `{ kind: 'paired' }`: "this permanent is paired with another creature", read from `partnerOf`. It reads only the object table (no characteristic), so it is a plain condition for the layers and may sit on a layer 6 grant (`validate-static-condition.ts`; the engine reads it in `rules/static-conditions.ts` for derive and `rules/conditions.ts` for abilities). `unpaired` is its `not` (the parser lowers "isn't paired" to `not(paired)`).
- **Subject.** A new `StaticSubject` `{ kind: 'pair' }`: "this creature and the creature it is paired with" ("each of those creatures", "both creatures"). `subjectAffects` (`rules/static-subject.ts`) says yes for the source and for `partnerOf(source)`. The set is not locked in (CR 611.3a): it is whatever the pairing is at any moment, and ends when the source leaves (611.3b) or the pair ends. One static ability with `condition: paired` and subject `pair` is the whole of Breathkeeper's second line; `condition` is redundant with the subject but keeps the text honest and lets a card say "as long as ~ is paired, ~ has flying" with subject `this`.
- **Layering.** The grant is `grantAbility` (layer 6, CR 613.1f) with the triggered ability of the quoted text; it has the Seraph's timestamp (613.7a). Both creatures get it, including the Seraph itself, as the text says ("each of those creatures"). `grantAbility` already makes a triggered ability that "triggers as the subject's own, with the subject as its source" (`ast/types.ts`), which is what "When this creature dies" needs. `derive` caches are keyed by the identity of the state and the object (D-173 notes in `docs/DECISIONS.md`), and `paired` lives in the object table, so no cache key changes; `derive-cache-keys.test.ts` gets a case: the same battlefield with and without the link.
- **Look-back.** The dies trigger of the granted ability must fire when the partner dies, when the Seraph dies, and when both die together. CR 603.10a makes dies a look-back trigger, and the engine's look-back reads the battlefield before the departures (`docs/MECHANICS.md`, triggers). The link is in the pre-departure objects, so the grant is seen; whether `findTriggers` really derives granted abilities from the pre-state for a granted `dies` trigger is the first thing to prove with a test, not something I verified by running.

## Decisions the player makes

Only one new question: which creature, if any, to pair with, on resolution. Reuse over new kinds:

- **Reused: `choosePermanent`** (`state/decisions.ts`), with one new `purpose: 'soulbond'`. `seat` is the controller of the ability, `subject` the soulbond creature, `legal` the creatures that qualify now (unpaired, others, yours, creatures by `derive`), `min` 0 and `max` 1: declining is choosing none, which is "you may" (603.5). For trigger 2 `legal` has the one entering creature (or is empty and nothing is asked). The existing rule "with no more candidates than `min` the engine chooses by itself" does not apply (`min` is 0), so a one-candidate pairing is still asked; with no candidate (the creature left in response) nothing is asked and nobody is paired. `source` is the ability on the stack. The answer is the existing `choosePermanents` action; the engine remains the judge of it.
- **Not new:** `confirmOptional` (rejected: it cannot name the partner when there are several, and two kinds of question for one ability would double the web and AI work), `targets` (rejected: not a target, 702.95a; making it one would give opponents' hexproof and ward a say it does not have), `orderTriggers` (reused as is).
- **New events:** `creaturesPaired { a, b, by }` and `creaturesUnpaired { a, b, why }` (`why`: `left`, `control`, `notCreature`), for the log and for the view's animation; `ObjectView` gets `pairedWith?: ObjectId`, the validated partner, public information (both are on the battlefield).

Actions: no new `Action` kind. `legalActionsForDecision` lists one `choosePermanents` per legal partner plus the empty one (and concede), like the other optional choosePermanent purposes.

## View and UI

- `ObjectView.pairedWith` shows the partner; `getView` computes it with `partnerOf`, so it is never stale.
- Web: a "Paired" badge on both tiles and a thin line or a shared colour between them on the battlefield (one visual language with the existing Ring-bearer and attachment badges in `apps/web/src/ui/board/Tile.tsx`); the decision is shown by the existing permanent-choice panel (`ui/decisions/PermanentPanel.tsx`) with a new words module like `permanents-ring.ts`: prompt "Pair Breathkeeper Seraph with another creature?", detail "Click a creature to pair it, or choose none"; with one candidate the click path stays the same (no new dialog). Log lines for the two events; stack text for the two expanded abilities (written from CR 702.95a in plain words, like the other keyword expansions); the condition and subject words in `game/condition-text.ts`.
- Opponents see the same pair (public).

## The AI

- `CasualAgent` (`packages/ai/src/casual-agent.ts`, `choosePermanent` is a chain on `d.purpose`): add `soulbond` with a new `casual-pair.ts`. Pairing is only upside (the grant is a "may" with no cost), but the cost is the opportunity: a paired creature cannot be paired again while it stands (702.95d), so a poor early partner blocks a better one later. Casual rule, deterministic: always pair when a candidate exists; choose the candidate with the most power, then toughness, ties to the first listed (the shape of `chooseRingBearer`). I did not read the existing default branch for an unknown purpose; without the new case it would take its fallback, which has to be checked so the AI never answers with an illegal action.
- `HeuristicAgent` (`heuristic-agent.ts` delegates `choosePermanent` to the casual agent except for the Ring-bearer): the first version delegates too. A better one weighs which creature the grant helps (evasion, an attacker that connects, a creature that would die) and may decline to pair when a later better partner is likely in hand; that needs the evaluator and is deferred (ROADMAP), not guessed now.
- Neither agent reads `paired` elsewhere (blocks, attacks, removal targets); the grant is already in the derived abilities they read.

## Engine invariants and derive-digest effects

- `ENGINE_VERSION` moves (76 to 77 at this base): behavior changes only where soulbond or `paired` appear, and the field is absent otherwise, so the hashes of games without them differ only by the version carried in the state hash. `derive-digest.expected.json` is recorded again (`UPDATE_DERIVE_DIGESTS=1`, as D-264 and the older entries did) and the SYNTHETIC soulbond cards that join the pool of the soup decks of `derive-differential.test.ts` change those games too, which is expected, not a regression. `node tools/perf/precon-digest.ts` must print the same lines on the base and on the branch apart from the version (no precon is known to hold a soulbond card; unmeasured here), and `node tools/perf/derive-bench.ts` is run once to see that `partnerOf` in the static subject test costs nothing visible (it is one object lookup).
- `PARSER_VERSION` moves (82 to 83); the golden corpus is regenerated (`golden.expected.json`, acceptance digests) and Breathkeeper Seraph moves from `unsupported` to `supported` only when all three pieces above exist; before that it stays unsupported with an honest reason, and the keyword alone must not be accepted: if the keyword is built before the grant and the delayed return, a card with `soulbond` and an unread second line stays unsupported as a whole (a card is supported or unsupported, never partly).
- `control-reads.test.ts` stays green because `rules/pairing.ts` reads controllers with `controllerOf`.
- `determinize.ts` and `hash.ts` need no change as far as I read (they carry object fields generically; to confirm with the existing hash tests); `testing/assemble.ts` and `testing/types.ts` get a scenario option `paired(a, b)` and `expect.paired(a, b)`.
- No new import crosses a package boundary; `tools/boundaries` is untouched.

## Tests (written first, SYNTHETIC cards in `packages/engine/src/cards/fixtures/synthetic-soulbond.ts` marked SYNTHETIC)

Engine scenarios (`scenario-xx-soulbond.test.ts`):
- the enters trigger offers each unpaired creature and "none"; pairing sets both links; declining pairs nothing; no trigger when no other creature (intervening "if" false at the event);
- the second trigger: another creature of yours entering pairs with the soulbond creature; an opponent's creature does not trigger; a creature entering while the soulbond creature is paired does not trigger;
- CR 702.95c at resolution: the partner left, stopped being a creature, or changed controller in response, so nobody is paired; CR 603.4: the soulbond creature got paired in response, so the ability does nothing;
- two soulbond creatures and one newcomer: two triggers, the order decision, the second does nothing; two creatures entering together;
- CR 702.95e: each cause alone (the partner leaves by death, bounce, exile; either stops being a creature by a type-changing effect; either changes controller; control returns later and the pair does not come back); a flickered partner comes back unpaired; a copy and a token copy of a paired creature are unpaired; both of one pair destroyed together;
- the grant: both creatures have the ability while paired and neither after; the opponent's view; a creature entering later is not affected by a partner it does not have; a second paired Seraph for another pair; layer 6 order against "loses all abilities" (a creature that lost its abilities after the grant, and one that got the grant after);
- the dies ability with the grant: partner dies (returns at your next upkeep as a new object, owner's control), the Seraph dies, both die together (two delayed abilities), declined ("you may"), the card exiled in the meantime (nothing returned, CR 603.7c), a commander that goes to the command zone (nothing returned), the dies resolving during your own upkeep (the next one, CR 603.7a), a token (nothing);
- phasing (once the owner answers the open question below);
- legal actions agree with `applyAction`; `applyAction` refuses a partner not in `legal`, a second answer, the wrong seat; replay and determinism; `checkInvariants` after every step of the soak.

The dies-and-return slice, no pairing: a scenario test next to `scenario-xx-delayed-return.test.ts` (the D-205 delayed return) for the delayed move of `triggerCard`, and a validator test that accepts it and still refuses the other shapes.

Rules and derive: `derive-cache-keys.test.ts` case (same battlefield, with and without `paired`); `derive-differential` digests re-recorded.

Cards (parser): `parser-p70-soulbond.test.ts` (the keyword line with and without its reminder text; "paired with another creature" condition; the quoted-grant line with the dies body; near misses that must stay unsupported: "paired with a Human", granting a keyword through soulbond, "unpaired" in a trigger of a card), the golden corpus transition, a conversion test to the engine card.

AI: `casual-pair.test.ts` (always pairs, picks the strongest, deterministic ties, never an illegal answer), a soak with a `soulbond` deck style of 100 games replayed by hash (the shape of `chosen-games.test.ts`), and `pnpm test:soak` once.

Web: a model test for the prompt words, a render test for the badge, one e2e (hidden deck `synthetic-soulbond`).

Mutation checks on a scratch copy, a handful: the resolution re-check removed (702.95c), the link set on one side only, the creature test of the pass removed, the stale-link read removed (`partnerOf` trusting the id), a pairing allowed over an existing pair.

## Order of the build

1. Slice P, independent: the delayed return of `triggerCard` and the `may` around it (validator, effect, parser template for the body of the granted ability), with a `D-` entry. Testable on a plain permanent that has the dies ability printed.
2. State and rules: `GameObject.paired`, `rules/pairing.ts`, the `pair` effect and the re-checks, the SBA step, events, invariants. Tests first for 702.95c to 702.95e.
3. AST and expansion: the keyword, the two triggers, the internal condition, `validateCard` refusals (including the keyword on a card whose other lines are unread), supported-feature registration.
4. Condition `paired` and subject `pair`, the grant, look-back test.
5. Decision purpose, legal actions, view field.
6. Parser rules: `keyword.line` (soulbond), `condition.paired`, `static.paired-grant` (with the quoted ability). `PARSER_VERSION`, golden regeneration.
7. AI (casual, heuristic delegation), web (badge, prompt, log, text), testing DSL options.
8. Docs: `docs/MECHANICS.md`, `docs/ARCHITECTURE.md`, `docs/RULES_COVERAGE.md` (702.95 rows), `docs/ROADMAP.md` (the approximations), a `D-` entry for the S-class decision, `docs/STATUS.md`, the Bruna status row.

Size, my estimate and not measured: a medium slice, clearly smaller than meld and face-down. It adds one optional field and one reader module (about 150 lines), one effect, two conditions, one subject, one decision purpose, two events, roughly a dozen engine files touched each by a few lines, plus the parser, AI and web edits of the same size as the Ring-bearer's (D-196). The risk is not in the volume but in the places listed next.

## Risks

- **Stale links and the object table.** A link names an object id; every reader must go through `partnerOf`. A reader that reads `paired.with` raw would see ghosts. Mitigation: only `rules/pairing.ts` and the view read the field; a test like `control-reads.test.ts` that fails when another file reads `.paired` directly.
- **Layer cycle.** The creature test cannot run inside derive. The approximation (a grant still applies between losing creature types and the next state-based pass) is recorded; whether it can ever show in a visible way is limited to a single resolution.
- **Look-back with a granted trigger.** Not proven, see above; if the engine derives granted abilities only from the current state, a dying partner would lose its grant at the moment it dies and the card would be wrong, which would turn this into a larger fix inside `findTriggers`.
- **Several seats.** The engine supports more than two seats in tests; the web plays one human against one AI. `by` and the control checks are per player, nothing assumes two seats.
- **Honesty.** The keyword must not be accepted while any other line of the card is unread; the second line of most soulbond cards varies (keywords, +N/+N, activated abilities as Deadeye Navigator's) and each shape is its own parser rule. Only Breathkeeper Seraph is covered by this proposal; the others are new parser work after the engine slice.
- **Unverified here.** I did not run any code, and I did not check Gatherer rulings (the sandbox cannot reach them); every rule above is from the CR text. How the card's "you may" is meant (at the dies trigger or at the delayed trigger, see below) is my reading, not a ruling.

## Open questions for the owner

1. **Approve the slicing?** Build the dies-and-return slice (P) first as its own `D-` entry, then soulbond as S, so that the first can land even if the second waits.
2. **Phasing.** Should a pair survive one of the two phasing out? CR 702.95e names only control, creature-ness and leaving the battlefield, and 702.26d says phasing is not a zone change, so my reading is: the pair survives and the grant is inactive while the permanent is phased out (it is treated as not existing, 702.26b). The engine stores phased-out permanents with `zone: 'phased'` (D-234), so this needs an explicit rule in `partnerOf`. I could not check a published ruling. Which behavior do you want?
3. **"You may" of the granted ability.** In "When this creature dies, you may return it ... at the beginning of your next upkeep", I read the choice as made when the dies ability resolves (declining creates no delayed ability) and not again at the upkeep. A different reading asks at the upkeep. Which do you want, or do you have the ruling?
4. **One decision for one or several candidates.** I propose `choosePermanent` with `min` 0 in both cases (a one-candidate pairing is still asked, as a click or a "none"). The alternative is `confirmOptional` for the single-candidate trigger, which is a nicer prompt and a second code path in the UI and the AI. Do you accept the first?
5. **AI.** Is "always pair with the strongest creature" enough for the first version, with the smarter heuristic deferred?
6. **Scope of the other soulbond cards.** 24 cards carry the keyword in your report of 2026-10-22. Should the second lines of the common shapes (both creatures gain a keyword or +N/+N) be built in the same pass, since they only need new parser rules on top of the condition and subject, or wait for your next coverage report?

## Not built

Until it is approved, Breathkeeper Seraph stays unsupported, with the unparsed line "Flying, soulbond" reported as it is now, and the Bruna deck cannot reach "FULLY SUPPORTED" without it (and without meld, `docs/proposals/meld.md`).

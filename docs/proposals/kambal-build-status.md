# Kambal deck support

Source: owner-provided GitHub issue #255. Its card-data block is the source for the 20 acceptance cards; `decks/kambal.txt` is the submitted Commander list. The issue validates as complete. No card rulings have been fetched or assumed.

## Status

- [x] 18 of 20 unsupported cards are fully supported: Rhox Faithmender, The Wind Crystal, Archenemy's Charm, Kimoyo Beads, Revival // Revenge, Daxos, Blessed by the Sun, Lunar Convocation, Wall of Reverence, Moseo, Vein's New Dean, Tivash, Gloom Summoner, Call of the Ring, Cleric Class, Liesa, Forgotten Archangel, Skrelv's Hive, Authority of the Consuls, Underworld Connections, Tragic Slip, and Liesa, Shroud of Dusk.
- Current branch: `support-kambal`.
- Current group: F — Liesa, Shroud of Dusk's commander-tax life replacement is supported (D-598).
- Next: Ob Nixilis of the Black Oath.

## Cards and initial gap groups

The grouping below is provisional until the corpus diagnostics are reviewed alongside the AST and engine coverage.

### Group A — life-gain replacements

- [x] Rhox Faithmender — replacement effect doubles life gained.
- [x] The Wind Crystal — replacement effect doubles life gained.
- Gap resolved: the affected player orders applicable additive and multiplicative replacements when their order changes the result; the flow resumes for resolving effects and lifelink damage. See [the approved and implemented proposal](kambal-life-gain-replacements.md).

### Group B — modalities and split effects

- [x] Archenemy's Charm — all three modes parse; its one-or-two target mode returns creature and/or planeswalker cards.
- [x] Kimoyo Beads — remembers modal choices for the source permanent; leaving and returning starts a new history.
- [x] Revival // Revenge — `lifeTotalOf` amount reads each affected player's total as instructions resolve; life-gain replacements still apply to life-total increases.

### Group C — life, toughness, and scaling

- [x] Daxos, Blessed by the Sun — characteristic-defining toughness follows the controller's white devotion (D-585).
- [x] Lunar Convocation — end-step condition requires both life gain and life loss this turn (D-586).
- [x] Moseo, Vein's New Dean — graveyard creature targets can be limited by the life gained this turn (D-588).
- [x] Tivash, Gloom Summoner — defined life gained this turn is used for both the life payment and X/X token stats (D-589).
- [x] Wall of Reverence — life gain can read the power of its targeted creature (D-587).

### Group D — triggers, Class abilities, and return effects

- [x] Call of the Ring — only triggers after a creature is chosen as Ring-bearer (D-590).
- [x] Cleric Class — reaching level 3 emits a Class-level event and triggers its return-and-life ability (D-591).
- [x] Liesa, Forgotten Archangel — a dies trigger schedules its creature card to its owner's hand at the next end step (D-592).
- [x] Skrelv's Hive

### Group E — continuous and attached abilities

- [x] Authority of the Consuls
- [x] Underworld Connections

### Group F — other spell and permanent abilities

- [ ] Liesa, Shroud of Dusk
- [ ] Ob Nixilis of the Black Oath
- [ ] Teferi's Reproach
- [x] Tragic Slip — its Morbid replacement reads the creature-death history for the turn (D-597).
- [x] Liesa, Shroud of Dusk — each prior command-zone cast tax is paid as 2 life instead of {2} mana (D-598; approved proposal).

## Validation

- Intake: `pnpm corpus:check-issue --body <issue body>` — complete, 20 unsupported cards.
- Corpus additions: `pnpm corpus:from-issue --body <issue body> --issue 255` — added 20 new card records.
- Golden snapshot regenerated after parser support; `pnpm test:focus -- packages/cards/test/golden.test.ts` passes.
- The focused engine, parser, AI, web rendering and golden checks for group A pass; see the proposal for the command.
- `Archenemy's Charm` now passes default import and golden support. Focused parser registry, real-card integration, and golden tests pass; the tests cover one target and two targets of different card types.
- `Tivash, Gloom Summoner` passes parser and golden support: defined life gained this turn is used for the payment and X/X token stats. The focused parser, validation, golden and typecheck checks pass.
- `Call of the Ring` passes parser and golden support. Focused Ring scenario tests prove the filtered trigger does not fire with no creature available and does fire after a creature is chosen. `pnpm typecheck`, `pnpm lint`, and dependency boundaries pass; lint reports existing warnings and informational findings outside this work.
- `Liesa, Forgotten Archangel` passes real-card parser/golden support. The delayed trigger reuses `triggerCard` and returns the card from the graveyard to its owner's hand at the next end step. Its focused scenario, parser registry, golden and derive checks pass; typecheck and lint pass.
- Skrelv's Hive parses completely: the Mite has Toxic 1 and can't block; corrupted grants lifelink to your creatures with Toxic while an opponent has three or more poison counters (D-593, D-594). Engine scenarios check both sides of the threshold.
- Authority of the Consuls parses completely (D-595): creatures your opponents control enter tapped, and its creature-entry life trigger uses the existing trigger and life-gain rules. An engine scenario checks the entry replacement.
- Underworld Connections parses completely (D-596): an Aura can grant an activated ability to the typed attached land; activating it taps the land, pays 1 life, and draws a card.

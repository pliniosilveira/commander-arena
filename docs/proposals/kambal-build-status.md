# Kambal deck support

Source: owner-provided GitHub issue #255. Its card-data block is the source for the 20 acceptance cards; `decks/kambal.txt` is the submitted Commander list. The issue validates as complete. No card rulings have been fetched or assumed.

## Status

- [x] 5 of 20 unsupported cards are fully supported: Rhox Faithmender, The Wind Crystal, Archenemy's Charm, Kimoyo Beads, and Revival // Revenge.
- Current branch: `support-kambal`.
- Current group: B — modalities and split effects; all three cards in the group are done.
- Next: Daxos, Blessed by the Sun and Lunar Convocation.

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
- [ ] Cleric Class
- [ ] Liesa, Forgotten Archangel
- [ ] Skrelv's Hive

### Group E — continuous and attached abilities

- [ ] Authority of the Consuls
- [ ] Underworld Connections

### Group F — other spell and permanent abilities

- [ ] Liesa, Shroud of Dusk
- [ ] Ob Nixilis of the Black Oath
- [ ] Teferi's Reproach
- [ ] Tragic Slip

## Validation

- Intake: `pnpm corpus:check-issue --body <issue body>` — complete, 20 unsupported cards.
- Corpus additions: `pnpm corpus:from-issue --body <issue body> --issue 255` — added 20 new card records.
- Golden snapshot regenerated after parser support; `pnpm test:focus -- packages/cards/test/golden.test.ts` passes.
- The focused engine, parser, AI, web rendering and golden checks for group A pass; see the proposal for the command.
- `Archenemy's Charm` now passes default import and golden support. Focused parser registry, real-card integration, and golden tests pass; the tests cover one target and two targets of different card types.

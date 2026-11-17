# Kambal deck support

Source: owner-provided GitHub issue #255. Its card-data block is the source for the 20 acceptance cards; `decks/kambal.txt` is the submitted Commander list. The issue validates as complete. No card rulings have been fetched or assumed.

## Status

- [x] 3 of 20 unsupported cards are fully supported: Rhox Faithmender, The Wind Crystal, and Archenemy's Charm.
- Current branch: `support-kambal`.
- Current group: B — modalities and split effects; Archenemy's Charm is done.
- Next: Kimoyo Beads and Revival // Revenge.

## Cards and initial gap groups

The grouping below is provisional until the corpus diagnostics are reviewed alongside the AST and engine coverage.

### Group A — life-gain replacements

- [x] Rhox Faithmender — replacement effect doubles life gained.
- [x] The Wind Crystal — replacement effect doubles life gained.
- Gap resolved: the affected player orders applicable additive and multiplicative replacements when their order changes the result; the flow resumes for resolving effects and lifelink damage. See [the approved and implemented proposal](kambal-life-gain-replacements.md).

### Group B — modalities and split effects

- [x] Archenemy's Charm — all three modes parse; its one-or-two target mode returns creature and/or planeswalker cards.
- [ ] Kimoyo Beads
- [ ] Revival // Revenge

### Group C — life, toughness, and scaling

- [ ] Daxos, Blessed by the Sun
- [ ] Lunar Convocation
- [ ] Moseo, Vein's New Dean
- [ ] Tivash, Gloom Summoner
- [ ] Wall of Reverence

### Group D — triggers, Class abilities, and return effects

- [ ] Call of the Ring
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

# Lord of the Nazgûl deck support (issue 57)

Issue data is from the author's description. The 21 cards below were added to the golden corpus with `pnpm corpus:from-issue`; no existing corpus entries were replaced. The build's base is `21e93f4` (`origin/main` on 2026-11-16).

## Status

- [x] Intake checked with `pnpm corpus:check-issue`.
- [x] Decklist saved as `decks/lord-of-the-nazgul.txt`.
- [x] Corpus records added from issue 57.
- [x] Group 1: `Diabolic Vision`, `Sleight of Hand` (D-533, `PARSER_VERSION` 106).
- [x] Group 2a: `Slip Out the Back` uses the existing one-shot phasing effect (`PARSER_VERSION` 107).
- [x] Group 2b: `Nightscape Familiar` cost reduction for a union of spell colors (`PARSER_VERSION` 108).
- [x] Group 2c: `Wavebreak Hippocamp` triggers only for its controller's first spell during an opponent's turn (`ENGINE_VERSION` 99, `PARSER_VERSION` 109).
- [x] Group 2a: `Distant Melody` chooses a creature type as it resolves and counts permanents of that type (D-536, `ENGINE_VERSION` 100, `PARSER_VERSION` 110).
- [x] Group 2b: `Raise the Palisade` returns creatures outside the chosen type using the inverse filter (D-536).
- [x] Group 3: `Hermes, Overseer of Elpis` uses the existing attack-batch trigger for "you attack with one or more Birds" (D-537, `PARSER_VERSION` 111).
- [x] Group 4: `Feign Death` and `Supernatural Stamina` grant the target creature a triggered ability until end of turn; the dies trigger returns the card tapped and, for Feign Death, with a +1/+1 counter (D-538, `ENGINE_VERSION` 101, `PARSER_VERSION` 112).
- [x] Group 5: `Into the Flood Maw` uses the generic tapped Fish Gift effect and selects the return target from the matching promised or unpromised branch (D-539, `ENGINE_VERSION` 102, `PARSER_VERSION` 113).
- [x] Group 6: `Gix's Command` carries the resolving choice of a creature into its lifelink instruction and returns up to two creature cards from the graveyard (D-540, `ENGINE_VERSION` 103, `PARSER_VERSION` 114).
- [x] Group 7: `Drown in the Loch` limits each target's mana value by the number of cards in that target controller's graveyard (D-541, `ENGINE_VERSION` 104, `PARSER_VERSION` 115).
- [x] Group 8: `Domineering Will` gives its targeted player control of up to three target nonattacking creatures, untaps those targets, and requires them to block if able (D-542, D-543, `ENGINE_VERSION` 106, `PARSER_VERSION` 117).
- [x] Group 9: `Voracious Bibliophile` draws one card per target of the spell that triggered it (D-544, `ENGINE_VERSION` 107, `PARSER_VERSION` 118).
- [x] Group 10: `March of Swirling Mist` chooses an optional number of blue cards to exile before X, applies its {2}-per-card reduction, and phases out up to X targets (D-545, `ENGINE_VERSION` 108, `PARSER_VERSION` 119).
- [x] The owner approved all five remaining subsystem designs; the approved designs are now in `docs/design/lord-of-the-nazgul-remaining-subsystems.md`.
- [x] Group 11: `Fandaniel, Telophoroi Ascian` runs from its hand-written engine fixture (D-546, `ENGINE_VERSION` 109). `playersMay.otherwise` identifies the player who declined, and an unavailable sacrifice choice declines automatically. The general parser still does not read the full may-sacrifice phrase.
- [x] Group 12: `Lord of the Nazgûl` grants Wraiths protection from Ring-bearers, creates a 3/3 Wraith with menace for each instant or sorcery cast, and sets its Wraiths to base 9/9 through end of turn when the post-creation count reaches nine (D-547, `ENGINE_VERSION` 110). The full card uses its hand-written engine fixture because the general parser does not read its protection and base-power clauses.
- [ ] Rerun `UPDATE_GOLDEN=1 pnpm exec vitest run packages/cards/test/golden.test.ts` after each parser group.
- [ ] Implement the two approved subsystems still queued: `Maskwood Nexus` and `Sauron's Ransom`.
- [ ] Run `pnpm corpus:decks --deck decks/lord-of-the-nazgul.txt` with the owner's bulk file; unavailable in this workspace.

At intake, current `main` already supported `Lazotep Plating`. Completed groups through 12 bring the app's default import path to 19 of the 21 issue cards supported; `Maskwood Nexus` and `Sauron's Ransom` remain. The two hand-written fixtures are supported on the app path while still reported unsupported by the grammar-only golden snapshot. No deck-wide coverage result is claimed.

## The Lord of the Nazgûl deck, issue 57, group 7: Drown in the Loch (D-541)

- **Engine.** A mana-value target filter can count cards in the graveyard owned by the controller of that same target. Candidate targets are included while checking the filter at cast time, and chosen targets are checked again on resolution.
- **Parser.** Read `the number of cards in its controller's graveyard` as a count amount and bind `its` to the target whose mana value is limited.
- **Proof.** `convert-grammar-engine-drown-in-the-loch.test.ts` plays both modal choices, checks the target controller's graveyard, and rejects a creature target whose mana value exceeds that count. The Comprehensive Rules text was unavailable in this workspace; citations were not independently verified.

## The Lord of the Nazgûl deck, issue 57, group 8: Domineering Will (D-542, D-543)

- **Engine.** A targeted player can gain control of a chosen target group; temporary `mustBlock` requirements are evaluated jointly with attacker requirements.
- **Parser.** Targeted nonattacking creatures are filtered at selection and resolution. The control, untap and must-block instructions all name the same target group.
- **Proof.** `convert-grammar-engine-domineering-will.test.ts` checks support, control, untapping, and the mandatory block. The Comprehensive Rules text was unavailable in this workspace; citations were not independently verified.

## The Lord of the Nazgûl deck, issue 57, group 9: Voracious Bibliophile (D-544)

- **Engine.** Cast events preserve the chosen target count and the triggered ability reads that fixed number when it resolves.
- **Parser.** "With one or more targets" filters the cast trigger; "draw that many" refers to the spell's target count.
- **Proof.** The synthetic engine test checks two targets and no targets; the real-card scenario checks the two-target case. The Comprehensive Rules text was unavailable in this workspace; citations were not independently verified.

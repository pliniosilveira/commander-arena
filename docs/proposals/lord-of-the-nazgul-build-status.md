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
- [ ] Remaining independent parser and engine gaps: `Domineering Will`, `Drown in the Loch`, `Fandaniel, Telophoroi Ascian`, `Lord of the Nazgûl`, `Maskwood Nexus`, `Sauron's Ransom`, `Voracious Bibliophile`.
- [ ] `March of Swirling Mist` uses the existing one-shot phasing machinery but needs X target handling and its exile cost. Assess it as its own engine/parser slice.
- [ ] Rerun `UPDATE_GOLDEN=1 pnpm exec vitest run packages/cards/test/golden.test.ts` after each parser group.
- [ ] Run `pnpm corpus:decks --deck decks/lord-of-the-nazgul.txt` with the owner's bulk file; unavailable in this workspace.

At intake, current `main` already supported `Lazotep Plating`. The completed groups through 6 bring the count to 13 of the 21 issue cards supported; the other 8 remain unsupported. No deck-wide coverage result is claimed.

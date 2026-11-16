# Lord of the Nazgûl deck support (issue 57)

Issue data is from the author's description. The 21 cards below were added to the golden corpus with `pnpm corpus:from-issue`; no existing corpus entries were replaced. The build's base is `21e93f4` (`origin/main` on 2026-11-16).

## Status

- [x] Intake checked with `pnpm corpus:check-issue`.
- [x] Decklist saved as `decks/lord-of-the-nazgul.txt`.
- [x] Corpus records added from issue 57.
- [x] Group 1: `Diabolic Vision`, `Sleight of Hand` (D-533, `PARSER_VERSION` 106).
- [x] Group 2a: `Slip Out the Back` uses the existing one-shot phasing effect (`PARSER_VERSION` 107).
- [x] Group 2b: `Nightscape Familiar` cost reduction for a union of spell colors (`PARSER_VERSION` 108).
- [ ] Group 2: creature-type choice and its effects: `Distant Melody`, `Raise the Palisade`.
- [ ] Remaining independent parser and engine gaps: `Domineering Will`, `Drown in the Loch`, `Fandaniel, Telophoroi Ascian`, `Feign Death`, `Gix's Command`, `Hermes, Overseer of Elpis`, `Lord of the Nazgûl`, `Maskwood Nexus`, `Sauron's Ransom`, `Supernatural Stamina`, `Voracious Bibliophile`, `Wavebreak Hippocamp`.
- [ ] `Into the Flood Maw` extends the existing Gift support to a tapped Fish token; `March of Swirling Mist` uses the existing one-shot phasing machinery but needs X target handling and its exile cost. Assess each as its own engine/parser slice.
- [ ] Rerun `UPDATE_GOLDEN=1 pnpm exec vitest run packages/cards/test/golden.test.ts` after each parser group.
- [ ] Run `pnpm corpus:decks --deck decks/lord-of-the-nazgul.txt` with the owner's bulk file; unavailable in this workspace.

At intake, current `main` already supported `Lazotep Plating`. Groups 1 and 2a–2b bring the count to 5 of the 21 issue cards supported; the other 16 remain unsupported. No deck-wide coverage result is claimed.

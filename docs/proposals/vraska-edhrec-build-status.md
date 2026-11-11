# Vraska EDHREC deck: build status (branch `m68-vraska-edhrec`)

The running checklist of the whole-deck program for `decks/vraska-edhrec.txt` (issue 120). One branch, one pull request; each group is committed and pushed when it is done, so another agent can continue from the branch. The target: `pnpm corpus:decks` shows "FULLY SUPPORTED" for the deck. The measuring test is `packages/cards/test/vraska-edhrec-deck.test.ts` (every card of the deck that is in the golden corpus must read completely and be supported). Decisions are D-216 and following; `ENGINE_VERSION` and `PARSER_VERSION` are bumped by each group.

Start: golden snapshot at parser 62: training 163 of 191, hold-out 53 of 60, acceptance 120 of 159.

| Card | Group | Status | Blocking line / note |
| --- | --- | --- | --- |
| Ponder | 1 (D-216) | done | |
| Frantic Search | 1 | done | |
| Expressive Iteration | 1 | done | |
| Dispatch | 1 | done | |
| Kykar, Wind's Fury | 1 | done | |
| Idol of Oblivion | 1 | done | |
| Hammer of Purphoros | 1 | done | |
| Cyberdrive Awakener | 1 | done | |
| Craterclaw Colossus | 2 (D-217) | done | |
| Jeskai Ascendancy | 2 (D-217) | done | |
| Roar of Resistance | 2 and 3 (D-217, D-218) | done | |
| Saheeli, Sublime Artificer | 2 (D-217) | done | |
| Mana Sculpt | 2 (D-217) | done | |
| Arcane Denial | 2 (D-217) | done | |
| Mister Fantastic, Reed Richards | 3 (D-218) | done | |
| Storm-Kiln Artist | 3 (D-218) | done | |
| Alibou, Ancient Witness | 3 (D-218) | done | |
| Draconic Visitor | 4 (D-219) | done | |
| Stridehangar Automaton | 4 (D-219) | done | |
| Harmonic Prodigy | 5 (D-220) | done | |
| Wizard's Staff | 5 (D-220) | done | |

Golden after group 1: acceptance 127 of 159; after group 2: 133 of 159; after group 3: 137 of 159; after group 4: 139 of 159; after group 5: 141 of 159 (training and hold-out unchanged each time).

All 21 cards are built. What is left is the owner's run: `pnpm corpus:decks --file <oracle_cards> --deck decks/vraska-edhrec.txt` should show "FULLY SUPPORTED" (the sandbox has no bulk file; the cards of the golden corpus are proven by `vraska-edhrec-deck.test.ts`).

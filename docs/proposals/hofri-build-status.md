# Hofri Ghostforge deck: build status (branch `m72-hofri`)

The running checklist of the whole-deck program for `decks/hofri.txt` (issue 128). One branch, one pull request; each group is committed and pushed when it is done, so another agent can continue from the branch. The target: `pnpm corpus:decks` shows "FULLY SUPPORTED" for the deck. The measuring test is `packages/cards/test/hofri-deck.test.ts`: every card of the deck that is in the golden corpus must read completely and be supported, except the names of its `PENDING` list (the list is the checklist: a card that is supported leaves it, and the test fails if it does not). Decisions are D-229 and following; `ENGINE_VERSION` and `PARSER_VERSION` are bumped by each group.

Start: golden snapshot at parser 68: training 163 of 191, hold-out 53 of 60, acceptance 141 of 196.

| Card | Group | Status | Blocking line / note |
| --- | --- | --- | --- |
| Archaeomancer's Map | 1 (D-229) | done | |
| Drumbellower | 1 | done | |
| Gideon's Memorial | 1 | done | |
| Karmic Guide | 1 | done | protection from a color |
| Laelia, the Blade Reforged | 1 | done | |
| Monologue Tax | 1 | done | |
| Phoenix Down | 1 | done | |
| Quintorius, Field Historian | 1 | done | |
| Quintorius, History Chaser | 1 | done | |
| Spirit Mascot | 1 | done | |
| Staff of the Storyteller | 1 | done | |
| Study Hall | 1 | done | |
| Thancred Waters | 1 | done | |
| The Warring Triad | 1 | done | |
| Tocasia's Welcome | 1 | done | |
| Vanguard of the Restless | 1 | done | |
| Hofri Ghostforge, Valkyrie's Call, Excava, Storm of Souls, Ceaseless Conflict | 2 (D-230) | done | |
| Guardian Scalelord, Teshar, Venerable Warsinger, Sevinne's Reclamation, Ao the Dawn Sky | 2 | done | |
| Fiend Hunter | 2 | done | linked exile came with Hofri's token |
| Spirit of Resilience | 5 (D-233) | done | |
| Coin of Fate | 5 (D-233) | done | |
| Palace Jailer, Skyclave Apparition, Augusta, Tragic Arrogance | 3 (D-231) | done | Tragic Arrogance: the owner confirmed (2026-11-08) that the same permanent may be chosen for several of its types |
| Edgar, Serra Paragon | 4 (D-232) | done | |
| Guardian of Faith | 6 (D-234) | done | |
| Advanced Reconstruction | 7 (D-235) | done | |
| Turbulent Steppe | 8 (D-236) | done, from the owner's pasted text | read from the text the owner supplied (not a Scryfall extraction); covered by `convert-grammar-engine-p73.test.ts`; not yet in the golden corpus, so `hofri-deck.test.ts` does not measure it until the owner's `pnpm corpus:extract` adds it |

Final numbers (after group 7): golden training 163 of 191, hold-out 54 of 60, acceptance 178 of 196; `ENGINE_VERSION` 73, `PARSER_VERSION` 75 (76 after D-236); `packages/cards/test/hofri-deck.test.ts` has an empty `PENDING` list.

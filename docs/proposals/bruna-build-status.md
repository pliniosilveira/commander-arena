# Bruna deck: build status (branch `support-bruna`, issue 5)

The running checklist of the deck program for `decks/bruna.txt`. One branch, one pull request, committed after each group. The measuring test is the golden corpus (`packages/cards/test/fixtures/corpus/golden.expected.json`, the 27 acceptance cards of the issue). Decisions are D-252 and following. The card data comes from the issue's author; it is not checked against Scryfall.

| Card | Group | Gap | Status | Note |
| --- | --- | --- | --- | --- |
| Valkyrie Harbinger | 1 (D-252) | P | done | "if you gained N or more life this turn" |
| Angelic Accord | 1 | P | done | |
| Griffin Aerie | 1 | P | done | |
| The Book of Exalted Deeds | 1, 6 (D-275, D-276) | P | done | the life trigger (group 1) and a permanent grant of "you can't lose the game and your opponents can't win the game" |
| Bruna, the Fading Light | 7 (D-277 to D-282) | S | done | meld is built and tested (`docs/design/meld.md`); the owner extracted the real records with their `relatedParts` (commit "Add Bruna, Gisela and Brisela to the golden corpus from Scryfall data"), the Scryfall component names `meld_part` and `meld_result` are confirmed, and both halves read as supported in the golden corpus |
| Gisela, the Broken Blade | 7 | S | done | as Bruna |
| Breathkeeper Seraph | 8 (D-283 to D-287) | S | done | soulbond and pairing (`docs/design/soulbond.md`, approved by the owner): flying, the soulbond keyword with its two abilities, the paired grant of the dies-and-return ability, all read and run; golden: unsupported to supported (acceptance 204 to 205) |
| Ajani, Strength of the Pride | 6 (D-266 to D-268) | P | done | token named after the card, a leading life-total test, "each artifact and creature" |
| Angel of Destiny | 6 (D-269) | P | done | "loses the game", players this creature attacked this turn |
| Angel of Serenity | 6 (D-270) | P | done | a target slot of two zones, a linked exile returned to hand |
| Arch of Orazca | 5 (D-264) | K | done | Ascend on a permanent, the city's blessing |
| Arden Angel | 6 (D-271) | P | done | rolling a die and reading its result |
| Commander's Plate | 5 (D-259) | P | done | "Equip commander", protection from the colors outside the commander identity |
| Cosmos Elixir | 2 (D-253) | P | done | "draw a card if your life total is greater than your starting life total. Otherwise, you gain 2 life." |
| Dawnbreak Reclaimer | 6 (D-272) | P | done | a card of each graveyard returned in one event |
| Dismantling Wave | 6 (D-273) | P | done | "for each opponent, destroy up to one target" |
| Entreat the Angels | 6 (D-274) | K | done | Miracle |
| Everflowing Chalice | 3 (D-254) | P | done | "enters with a charge counter on it for each time it was kicked" |
| Heirloom Blade | 5 (D-261) | T | done | "shares a creature type with it" |
| Karoo | 5 (D-258) | P | done | "sacrifice it unless you return a permanent you control to its owner's hand" |
| Keeper of the Accord | 5 (D-263) | P | done | "that player" of an opponent's step |
| Myriad Landscape | 5 (D-262) | P | done | up to two basic lands that share a land type |
| Nykthos Paragon | 5 (D-256) | P | done | "that many", "Do this only once each turn" (CR 603.2h) |
| Nykthos, Shrine to Nyx | 5 (D-265) | P | done | choose a color, mana equal to devotion; auto-pay refuses a plan that sacrifices devotion |
| Search for Glory | 5 (D-260) | P | done | snow mana spent; search for one of several kinds of card |
| Urza's Incubator | 4 (D-255) | T | done | "Creature spells of the chosen type cost {2} less to cast." (every player's spells) |
| Well of Lost Dreams | 5 (D-257) | P | done | "you may pay {X}, where X is at most the life gained. If you do, draw X cards" |

Golden after group 1: Valkyrie Harbinger, Angelic Accord and Griffin Aerie are supported; after group 2: Cosmos Elixir too; after group 3: Everflowing Chalice; after group 4: Urza's Incubator. After group 5 (seven independent groups built in parallel worktrees and reviewed twice, D-256 to D-264): ten more cards supported (golden acceptance 185 to 195, D-256 to D-265). After group 6 (eight more groups, built, reviewed and fixed in parallel worktrees, D-266 to D-276): nine more cards supported (golden acceptance 195 to 204); Vraska, Golgari Queen (not of this deck) also reads now through the "loses the game" effect. After group 7 (meld, approved and built in a worktree, reviewed from four sides, fixed and re-reviewed, D-277 to D-282): the mechanic and the cast restriction of Brisela are in the engine, the parser reads both texts and an end-to-end test with injected data shows both halves supported; the golden corpus keeps them unsupported until the owner's data step (see the table). After group 8 (soulbond and pairing, approved by the owner, built in a worktree, reviewed from four sides over three fix rounds, D-283 to D-287): Breathkeeper Seraph is supported, and with the owner's data step (Bruna and Gisela now read as supported, the component names `meld_part` and `meld_result` confirmed) all 27 acceptance cards of the deck read and run. Group 8 also fixed a rules bug it found on the way (D-283: the last-known information of permanents that leave together, CR 603.10a) and refuses, rather than reads wrongly, every wording of "paired" and of a sentence that asks another player that the engine would run with a different meaning (D-287). Versions: `PARSER_VERSION` 86, `ENGINE_VERSION` 79.

Flagged for the owner: `packages/ai/test/heuristic-games.test.ts` ("20 games against random") asserts a win rate of at least 0.8 over a seeded sample. After group 6 the sample gives 15 of 20 (it gave 16 before), and over 100 games (`SOAK_GAMES=100`) the rate is 0.76 now and was 0.79 at the commit before group 6, so the threshold is borderline with or without this work; each new SYNTHETIC card in the arena pool shifts the sample. The threshold was not changed. Decide whether to loosen it, raise the game count or tune the agent.

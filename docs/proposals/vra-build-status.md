# Vraska deck: build status (issue 70)

Issue 70 "deck support vra" (author `pliniosilveira`), decklist `decks/vra.txt`, branch `copilot/deck-support-vra`, PR #71. Its two card records came from the issue author (checked with `pnpm corpus:check-issue` and imported with `pnpm corpus:from-issue`). The owner also requested five additional cards in chat; their records were verified through the approved Scryfall lookup workflow. The goal is every card (D-317): a costly card is built later, never left out.

The decklist is included, but a whole-deck check needs the owner's Scryfall bulk file and has not been run.

| Card | Group | Class | Status | What it needs |
| --- | --- | --- | --- | --- |
| Countersculpt | 1 | T + P | supported (golden gate passes) | Behold a Jace or pay {1} as one of two additional-cost choices. |
| Way of the Cryomancer | 2 | P | supported (golden gate passes) | Planeswalkers you control gain a loyalty ability that creates a delayed trigger to copy the next instant or sorcery spell you cast this turn. |
| Cryotheory Adept | 3 | P | supported (golden gate passes) | Its graveyard activation exiles the card as a cost, then taps a target creature and gives it a stun counter. |
| Ruric Thar, Biomagus | — | — | supported before this work | No remaining parser or engine gap. |
| Dauntless Veteran | — | — | supported before this work | No remaining parser or engine gap. |
| Shatterwing Pegasus | — | — | supported before this work | No remaining parser or engine gap. |
| Strix Lookout | — | — | supported before this work | No remaining parser or engine gap. |

Groups: 1, the additional-cost choice and Behold payment; 2, granting and activating a loyalty ability with the existing delayed spell-copy effect; 3, a self-exile activated cost from the graveyard.

Focused checks: `pnpm test:focus -- packages/cards/test/parser-p47.test.ts packages/cards/test/convert-grammar-engine-vra.test.ts packages/engine/test/scenario-xx-additional-costs.test.ts packages/engine/test/scenario-xx-delayed-cast.test.ts`. The golden acceptance gate passes for all seven cards (Countersculpt needed the parser to read "behold a Jace", a planeswalker type alone, in `cost.behold`). The deck-wide coverage check still needs the owner's bulk file: run `pnpm corpus:decks --file <oracle_cards file> --deck decks/vra.txt`.

Owner decisions asked: none.

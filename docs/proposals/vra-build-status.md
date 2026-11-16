# Vraska deck: build status (issue 70)

Issue 70 "deck support vra" (author `pliniosilveira`), 2 unsupported cards, decklist `decks/vra.txt`, branch `copilot/deck-support-vra`, PR #71. Card data comes from the issue's author (the request was checked with `pnpm corpus:check-issue` and imported with `pnpm corpus:from-issue`). The goal is every card (D-317): a costly card is built later, never left out.

The decklist is included, but a whole-deck check needs the owner's Scryfall bulk file and has not been run.

| Card | Group | Class | Status | What it needs |
| --- | --- | --- | --- | --- |
| Countersculpt | 1 | T + P | in progress | Behold a Jace or pay {1} as one of two additional-cost choices. |
| Way of the Cryomancer | 2 | P | in progress | Planeswalkers you control gain a loyalty ability that creates a delayed trigger to copy the next instant or sorcery spell you cast this turn. |

Groups: 1, the additional-cost choice and behold payment; 2, granting and activating a loyalty ability with the existing delayed spell-copy effect.

Owner decisions asked: none so far.

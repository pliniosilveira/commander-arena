# Niv-Mizzet deck (issue 25): build status

The running checklist of the deck support routine for `decks/niv-mizzet.txt` (issue 25, Commander: Niv-Mizzet, Visionary). 23 cards were unsupported. A card is listed as done only when the golden corpus reads it as supported and its tests pass. The classes are those of `docs/CARD_SUPPORT_PLAYBOOK.md` (T template, P primitive, K keyword, S subsystem, O one-off). The groups come from three read-only surveys of the code; their claims were not all verified by a build yet.

| Card | Group | Class | Status | Note |
| --- | --- | --- | --- | --- |
| Prismari Charm | 1 | T | done | "each of one or two targets" (a minimum number of targets in the noun) |
| Untimely Malfunction | 1 | T | done | "one or two target creatures can't block this turn"; change-target already exists (D-181, D-182) |
| Flame of Anor | 1 | T | done | header "Choose one. If you control a Wizard as you cast ~, you may choose two instead." |
| Fading Hope | 1 | T | done | "If its mana value was 3 or less, scry 1." |
| Elixir of Immortality | 1 | T | waiting | "Shuffle ~ and your graveyard into their owner's library." |
| Dragonologist | 1 | T | waiting | "an instant, sorcery, or Dragon card" (a mix of types and a subtype) |
| Thunderdrum Soloist | 1 | T | waiting | Opus: "If five or more mana was spent to cast that spell ... instead" |
| Stella Lee, Wild Card | 2 | P | waiting | condition "you've cast three or more spells this turn" |
| Firemind Vessel | 2 | P | waiting | "Add two mana of different colors" |
| Bender's Waterskin | 2 | P | waiting | "Untap ~ during each other player's untap step" |
| Ivory Tower | 2 | P | waiting | an amount "minus 4" |
| Living Conundrum | 2 | P | waiting | skip a draw from an empty library (replacement), condition "no cards in your library" |
| Tablet of Discovery | 2 | P | waiting | "mill a card. You may play that card this turn" and mana spendable only on instants and sorceries |
| Niv-Mizzet, Visionary | 2 | P | waiting | "noncombat damage to an opponent, you draw that many cards" |
| Pyromancer's Goggles | 2 | P | waiting | mana rider: copy the red instant or sorcery the mana is spent on |
| Stock Up | 3 | P | waiting | the owner of the cards chooses the order at the bottom of the library |
| Galvanic Iteration | 3 | P | waiting | delayed trigger "when you next cast an instant or sorcery spell this turn" (state shape, version bump) |
| Thunderclap Drake | 3 | P | waiting | the same delayed trigger, copies for each commander cast |
| Veyran, Voice of Duality | 3 | P | waiting | triggers an additional time when casting or copying an instant or sorcery; one ruling question is open |
| Quistis Trepe | 3 | P | waiting | cast a target card from any graveyard, mana of any type, exile instead of the graveyard |
| Fiery Confluence | 4 | P (large) | waiting for the owner | "Choose three. You may choose the same mode more than once": repeatable modes (CR 700.2d), UI and AI |
| Fact or Fiction | 3 | P | approved by the owner (2026-11-12), waiting | an opponent separates revealed cards into two piles (CR 700.3); new purposes of existing decision kinds, no new kind |
| Reality Shift | M | S | approved by the owner (2026-11-12), waiting | manifest (CR 701.40) and the face-down permanents it needs; shown with the Manifest token image from Scryfall; the owner will use other manifest cards |

## Order

1. Group 1: parser rules only (no engine change). Seven cards.
2. Group 2: small engine primitives, each with a scenario test first.
3. Group 3: medium engine pieces (the delayed next-cast trigger, additional triggers, casting from a graveyard).
4. Group M (manifest, S-class, approved): the face-down permanent and the manifest effect, built in its own worktree in parallel with groups 1 to 3 (`docs/proposals/face-down.md` steps 1, 3, 4, 5 and 6, plus manifest).
5. Group 4: Fiery Confluence waits for the owner (`docs/proposals/niv-mizzet-owner-decisions.md`).

## Open questions

- Veyran: whether triggers caused by the cast but not about the spell (for example "becomes the target of a spell") are also doubled. Scryfall rulings could not be fetched, so the card is supported only for the cast triggers and the limit is stated in the report.
- Fiery Confluence: build or not (the owner). Reality Shift and Fact or Fiction: decided, build.
- The Manifest token image: the lookup on Scryfall (set and number, or a search by name) is UNVERIFIED because the cloud session cannot reach Scryfall; the web draws a plain face-down card when the image cannot be had.

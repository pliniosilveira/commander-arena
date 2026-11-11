# Rules version

STATUS: VERIFIED against the CR effective September 25, 2026, sha256 `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`, plus the Mystery Booster Commander Edition Update Bulletin of October 19, 2026 (applied as described below). The baseline is the one the SPEC expected.

This is the record required by SPEC section 5 and amendment A17 (D-017). It says which Comprehensive Rules (CR) file the project follows, which Update Bulletins were read and what was done about them, and that every rule number the SPEC cites was checked against the text.

## The file

| Field | Value |
| --- | --- |
| Verified on | 2026-10-20 |
| Verified by | Plinio Silveira (download on a local machine) and the M0 session (parser check, citations) |
| Source URL | `https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt`, discovered from `https://magic.wizards.com/en/rules` by `pnpm rules:fetch` |
| Original file name | `MagicCompRules 20260925.txt` |
| Effective date in the file | September 25, 2026 (`2026-09-25`) |
| sha256 | `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca` |
| Byte size | 977,752 (UTF-8, no BOM, LF line endings) |
| Fetched at | 2026-10-20T16:24:14Z |
| Same as the SPEC's expected date? | Yes |
| `pnpm rule --check` | 9 sections, 147 subsections, 1,175 rules, 1,991 sub-rules, 277 examples, 741 glossary entries, 0 unparsed lines, 0 diagnostics |

The counts were confirmed by an independent count over the raw text, and `tools/rules/cr-real.test.ts` pins them together with the hash. The first parser run reported 3 unparsed lines (205.4c, 509.1b, 606.5); see "Format findings" below.

How it got here: the cloud session cannot reach `magic.wizards.com` or `media.wizards.com` (network policy), so the owner ran `pnpm rules:fetch` locally and committed the result. Redistribution of the text in a public repository has not been checked with Wizards; the repository is private. See `README.md`, "The license question", and `docs/ROADMAP.md`.

## Format findings in the real file

Things the parser had to learn from this file. They are tested in `tools/rules/cr-real.test.ts` and `tools/rules/cr.test.ts`.

1. Two rules (205.4c, 509.1b) and 25 glossary entries contain U+2028 LINE SEPARATOR, followed by non-breaking spaces, as a soft line break inside one entry. The parser converts it to a newline.
2. Rule 606.5 is the only rule whose number is not followed by a period (`606.5 If the total cost…`). The period is now optional.
3. Everything else matched the assumptions in `README.md`: UTF-8, curly quotes, one rule per line, `Example:` lines under their rule, a Contents list, Glossary blocks separated by blank lines, Credits at the end.

## Update Bulletins

Checked on 2026-10-20 by web search from the session (the Wizards site itself is not reachable from it) and by the owner opening the bulletin page.

| Title | Date | Link | Rules it changes | Applied? | Notes |
| --- | --- | --- | --- | --- | --- |
| Mystery Booster Commander Edition Update Bulletin | October 19, 2026 | https://magic.wizards.com/en/news/announcements/mystery-booster-commander-edition-update-bulletin | New 903.5e (rulebreaker). Updated 122.1g, 201.4f, 205.3j, 207.2c, 608.2g, 614.13a (absorbs 614.13b). Double-faced card reorganization across 701.27, 701.28, 712 and the new 713 "Meld Cards"; meld cards are no longer double-faced cards. Oracle update to Tolabow, Loch Rascal. | Yes, see below | Full text: `bulletins/2026-10-19-mystery-booster-commander-edition.md`. The changes take effect with the product release; the CR file that contains them was not published when this was written. |
| Secrets of Strixhaven changes (unofficial write-up, judge community) | August 2026 | https://blogs.magicjudges.org/nametherule/?p=2481 | Predates the September 25 file | Not needed | Already contained in the file. Listed so nobody re-checks it. |

No other bulletin dated after September 25, 2026 was found.

### What "applied" means for this project

The CR file in this folder is the September 25 text. The bulletin's changes are applied to the project's references and plans, not to the text file:

- **Rule numbers from 713 onward shift by one** once Wizards publishes the file that inserts 713 "Meld Cards". In the September file: 713 Substitute Cards, 714 Saga Cards, 715 Adventurer Cards, 716 Class Cards, 717 Attraction Cards, 718 Prototype Cards, 719 Case Cards, 720 Omen Cards, 721 Station Cards, 722 Preparation Cards, 723 Controlling Another Player, 724 Ending Turns and Phases, 725 The Monarch, 726 The Initiative, 727 Restarting the Game, 728 Rad Counters, 729 Subgames, 730 Merging with Permanents, 731 Day and Night, 732 Taking Shortcuts, 733 Handling Illegal Actions. Each becomes one higher. This is why the project cites rules by number and title (A15): `CR 733 (Handling Illegal Actions)` stays findable after it becomes 734.
- **Meld cards are not double-faced cards.** Anything in the engine or parser that interprets "double-faced card" must exclude meld cards. Meld is unsupported in v1 anyway (SPEC 7.2).
- **Rulebreaker (903.5e, 207.2c)** is a deck-construction ability that works only on your commander. Deck validation (SPEC 5.8) must either implement it or flag a commander with rulebreaker as unsupported. v1 flags it; see `docs/ROADMAP.md`.
- **608.2g**: when an effect lets a player cast several spells during resolution, they choose the order. The engine must present that as a decision, not a fixed order.
- **614.13a** now applies to objects entering and leaving any zone. The replacement-effect pipeline (A1) must not offer an object's own simultaneous zone change as a choice for its own replacement effect.
- **122.1g** now matches 704.5w (a non-Siege battle with defense 0 goes to the graveyard), which the SPEC's state-based action list already includes.
- **201.4f, 205.3j**: naming an Adventure's name, and seven planeswalker subtypes. Card data comes from Scryfall; "name a card" choosers must accept Adventure names.
- **Tolabow, Loch Rascal** Oracle update: Scryfall carries the new text; nothing to do.

When Wizards publishes the next CR file: run `pnpm rules:fetch --force`, run `pnpm rule --check`, update `tools/rules/cr-real.test.ts` (hash and counts) and this file, and confirm the 7xx numbers above.

## Rule numbers cited by the SPEC

Every number the SPEC cites, checked with `pnpm rule <number>` against the September 25 file. "Title" is the subsection or keyword title the tool prints.

| CR number | SPEC location | Topic | Title in the file | Result |
| --- | --- | --- | --- | --- |
| 103 | 5.1 | Game setup | Starting the Game | unchanged |
| 103.5c | 5.1 | First mulligan free in multiplayer | Starting the Game | unchanged; text confirms it |
| 113.7a | A4 | Last-known information for abilities on the stack | Abilities | unchanged |
| 115 | 5.4 | Targets | Targets | unchanged |
| 117 | 5.2 | Priority | Timing and Priority | unchanged |
| 302.6 | 5.3 | Summoning sickness | Creatures | unchanged; text confirms attacking and {T}/{Q} abilities |
| 400.7 | 4.2 | New object on zone change | General (Zones) | unchanged |
| 405 | 5.2 | The stack | Stack | unchanged |
| 500 to 514 | 5.2 | Turn structure | General … Cleanup Step | unchanged |
| 506 to 511 | 5.5 | Combat | Combat Phase … End of Combat Step | unchanged |
| 510.1c | 5.5 | Damage divided among blockers as the controller chooses | Combat Damage Step | unchanged; text confirms it |
| 510.4 | 5.5 | First-strike damage step | Combat Damage Step | unchanged |
| 514.3a | 5.2 | Extra cleanup step | Cleanup Step | unchanged |
| 601, 601.2a to i | 5.3, A3 | Casting sequence | Casting Spells | unchanged; steps a to i exist |
| 601.2h | D-003 | Paying costs | Casting Spells | unchanged |
| 602 | 5.3 | Activating abilities | Activating Activated Abilities | unchanged |
| 603 | 5.2 | Triggered abilities | Handling Triggered Abilities | unchanged |
| 603.3b | 5.2 | Two-pass APNAP trigger placement | Handling Triggered Abilities | unchanged; text confirms it |
| 603.10 | A4 | Look-back triggers | Handling Triggered Abilities | unchanged |
| 605 | 5.3 | Mana abilities | Mana Abilities | unchanged |
| 606 | 5.3 | Loyalty abilities | Loyalty Abilities | unchanged |
| 608, 608.2b | 5.2, 5.4 | Resolution, target legality | Resolving Spells and Abilities | unchanged |
| 611 to 616 | 5.7 | Continuous, replacement, prevention | Continuous Effects … Interaction of Replacement and/or Prevention Effects | unchanged |
| 613 | 4.2 | Layers | Interaction of Continuous Effects | unchanged |
| 616 | 5.7 | Ordering replacement effects | Interaction of Replacement and/or Prevention Effects | unchanged; 616.1 confirms the affected player or controller chooses |
| 701 | 8.3 | Keyword actions | Keyword Actions | unchanged; Fight 701.14, Investigate 701.16, Mill 701.17, Scry 701.22, Surveil 701.25, Proliferate 701.34 |
| 702 | 8.3 | Keyword abilities | Keyword Abilities | unchanged; Ward 702.21a is a triggered ability |
| 702.2c | 5.5 | Deathtouch lethal for assignment | Deathtouch | unchanged; text confirms it |
| 702.19b | 5.5, A15 | Trample assignment | Trample | unchanged; text confirms it |
| 702.124 | 5.8 | Partner | Partner | unchanged; the file names "Partner", "Partner with [name]", "Choose a Background" and "Doctor's companion" as variants, and the "partner—[text]" family in general |
| 704 | 5.6 | State-based actions | State-Based Actions | unchanged; 704.5w covers battles |
| 713 | 5 | Meld, per the bulletin | Substitute Cards (September file) | becomes Meld Cards in the next file; Substitute Cards moves to 714 |
| 732 | D-003 | Handling Illegal Actions | Taking Shortcuts | D-003 cited the wrong number; corrected to 733 in D-035 |
| 733 | 5.3 | Handling Illegal Actions | Handling Illegal Actions | unchanged in the September file; 734 after the bulletin |
| 800.4a | 5.6, A14 | Leaving the game | General (Multiplayer) | unchanged |
| 806 | 2 | Free-for-all | Free-for-All Variant | unchanged |
| 903, 903.3, 903.8, 903.9a, 903.9b | 5.1, 5.6 to 5.8 | Commander | Commander | unchanged; 903.3 names creature, Vehicle and Spacecraft with a power/toughness box; 903.8 is the tax; 903.9a and 903.9b are as the SPEC describes |

## SPEC claims checked against the text

- Damage assignment order no longer exists: the only mention in the file is the glossary entry "Damage Assignment Order (Obsolete)". 510.1c, 702.19b and 702.2c read as the SPEC describes. Confirmed.
- Commander eligibility (903.3): creature card, Vehicle card, or Spacecraft card with one or more power/toughness boxes. Confirmed.
- Partner variants: see the 702.124 row. The SPEC's instruction not to hard-code "partner—[text]" names stands.
- Starting life 40 in Commander: 103.4c. Confirmed. First mulligan free in multiplayer: 103.5c. Confirmed.
- Mill, scry, surveil, investigate and proliferate are keyword actions in 701. Ward is a triggered ability (702.21a). Confirmed.
- The bulletin moves meld to 713 and shifts later 7xx numbers. Confirmed by the bulletin text; the shifted numbers are listed above.

## Record of changes to this file

| Date | Who | What |
| --- | --- | --- |
| 2026-10-20 | M0 tooling session | Created as NOT VERIFIED; the hosts were blocked. |
| 2026-10-20 | Owner and M0 session | CR downloaded locally and committed; parser fixed for two format quirks; bulletin read and applied; every cited number checked. STATUS: VERIFIED. |

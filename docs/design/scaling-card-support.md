# Design: scaling card support by capability slices, ordered by data

IMPLEMENTED. Executed as D-057 (the template analysis), D-058 (corpus tooling) and D-059 to D-061 (slice S2); the later slices went through the per-slice decisions of `docs/DECISIONS.md`. Kept as the design record.

Status: APPROVED by the owner on 2026-10-21 ("approved", after the 77-card deck analysis, a note removed in the docs cleanup). Raised by the owner after importing a real deck: 77 of 100 cards unsupported, with the worry that the parser does not scale and every card will need its own request.

## Why 77 of 100

The parser is not the bottleneck. The engine's AST today has three ability kinds (mana, replacement, keyword), 15 effect kinds, no triggered abilities, no activated abilities other than "{T}: add mana", no static or continuous effects and no layers. A card with a trigger, an activated ability or a static effect cannot be supported however good the grammar is, because there is no engine node for the parser to produce. Improving only the grammar changes nothing for those cards. What scales is the pair "engine capability plus the grammar rules that target it", added in slices that are general, and ordered by how many cards each slice unlocks.

Why it scales: grammar rules compose. About ten trigger shapes times about forty effect shapes times a handful of target shapes covers thousands of cards, so each new trigger or effect multiplies instead of adding one card. The support loop (SPEC 8) is then only for the long tail, not for the bulk.

## The slices, in the order I expect (to be confirmed by data)

| Slice | What it adds | What it unlocks |
| --- | --- | --- |
| S1 Spell effects on existing primitives | Grammar only: "destroy / exile / return target ...", "~ deals N damage to any target", draw, discard, gain or lose life, counter, tap, untap, +N/+N until end of turn, X amounts, "each opponent", "you may" | Many instants and sorceries; no engine change except small selector work |
| S2 Triggered abilities | The trigger subsystem (`docs/design/triggered-abilities.md`): enters, dies, attacks, cast, upkeep and end step, landfall, sacrificed; ordering; the choose-a-permanent decision | Every card of the form "When or whenever X, effect", combined with S1 effects. Korvold is the first card |
| S3 Activated abilities with costs | Costs ({T}, mana, sacrifice, discard, pay life, remove counters), activation on the stack, equip and crew | Mana creatures with conditions, sacrifice outlets, equipment, vehicles |
| S4 Static and continuous effects | Layers (CR 613), anthems, "can't be blocked", granting keywords, cost reduction, replacement and prevention effects | Lords, anthems, ramp and cost reducers, protection effects |
| S5 Library and zone effects | Search library (tutors, "basic land onto the battlefield tapped"), mill, scry, surveil, reveal, return from graveyard, tokens (Treasure, Food, Clue, creature tokens) | The ramp and card-advantage core of most Commander decks |
| S6 Layouts and card types | Modal double-faced, transform, adventure, split, saga; Equipment, Aura, Vehicle | Whole families of cards that are unsupported by layout alone |

## Measure first, then order

1. **Per deck, now.** The import screen has a "What blocks this deck?" panel (D-057): the unparsed abilities of the deck grouped by sentence shape, with the number of cards each shape blocks, and a "Copy template report" button. That is the data for the owner's own 77 cards.
2. **Across the format, next.** `pnpm corpus:templates` and `pnpm coverage:cards` (SPEC A21 and 7.3, pulled forward from M6): stream Scryfall's `oracle_cards` bulk file (gzipped JSON Lines, D-048), run the same conversion over every Commander-legal card, and write `reports/coverage.md` (supported share overall and for the top 500 and 1,000 by `edhrec_rank`) and `reports/backlog.md` (shapes ranked by cards blocked weighted by popularity). It needs network access to Scryfall's bulk host, so the owner runs it locally and commits or pastes the reports; the tool itself is built and tested here against a SYNTHETIC JSONL file.
3. **After every slice,** the same command measures the new coverage, so progress is a number and the slice order can change when the data says so. CI fails if coverage drops (SPEC 7.3).

## What this changes in the plan

- M5 is organised as the slices above instead of one big ability system; each slice ends with tests, the new grammar rules, a coverage number and a progress note.
- The corpus tooling moves from M6 to the start of M5. The rest of M6 (the inbox endpoint, `pnpm card:request`, the playbook) stays.
- Until coverage is high, most real decks will stay unplayable, because a deck with one unsupported card is invalid (D-056). The test decks and decks made of supported cards remain playable. I will not claim a coverage number before it is measured.

## Risks

- Layers, replacement effects and the stack interactions of S3 and S4 are the hard part of the rules; they carry the most scenario tests (SPEC tests 14 to 20).
- Some templates are long-tail (unique effects). Those stay for the support loop, one card at a time, and the backlog report keeps their cost visible.
- Percentages of "top 500" can mislead: a deck of mostly staples will be supported earlier than a deck of pet cards.

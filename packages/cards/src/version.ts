/**
 * Bump on every change to what the parser reads or to how a card's support is decided: cached
 * support reports (`SupportReport.parserVersion`, IndexedDB) and `golden.expected.json` are
 * recomputed when it changes. Rule ids are part of that contract: renaming one needs a bump,
 * because ids appear in reports.
 *
 * What each version added: `git log -p -- packages/cards/src/version.ts`, `docs/DECISIONS.md`
 * (one entry per slice) and `docs/MECHANICS.md`.
 */
// 105: Behold costs, granted loyalty abilities and graveyard self-exile activation costs (D-559 to D-561).
// 106: Galadriel deck: scry, the Ring, lands as creatures, exchange of control, buyback, dice (D-528 to D-558).
// 107: Read one-card look-and-take effects with the remaining cards ordered on top or bottom.
// 108: Bind "it phases out" to the earlier targeted creature.
// 109: Read repeated colored spell subjects in cost reductions.
// 110: Read a first-spell trigger during each opponent's turn.
// 111: Choose a creature type as a spell resolves and use it in the following instructions.
// 112: Read "you attack with one or more" through the existing attack-batch trigger.
// 113: Read temporary grants of a quoted triggered ability and return the card a creature became to the battlefield.
// 114: Read the tapped Fish form of Gift and condition target slots on whether Gift was promised.
// 115: Read optional resolving choices of permanents and graveyard cards (D-570).
// 116: Read a target mana-value limit from its controller's graveyard count (D-571).
// 117: Read "They block this turn if able" for the preceding plural creature group (D-572).
// 118: Read player-directed control of target groups and nonattacking creature filters (D-573).
// 119: Read "with one or more targets" and "draw that many" for a cast trigger (D-574).
// 120: Read optional exile-from-hand costs and reductions based on cards exiled that way (D-575).
// 121: Read life-gain doubling replacements (D-581).
// 122: Read and/or unions of card types in plural graveyard targets (D-582).
// 123: Read a triggered mode choice that has no duration qualifier (D-583).
// 124: Read life total doubling and losing half a target player's life (D-584).
// 125: Parse characteristic-defining toughness equal to devotion (D-585).
// 126: Parse the end-step condition that life was gained and lost (D-586).
// 127: Read the power of a target creature selected by the same ability (D-587).
// 128: Support Moseo's history-based graveyard mana-value limit (D-588).
// 129: Use a defined life amount for a payment and an X/X token (D-589).
// 130: Parse a trigger for choosing a creature as Ring-bearer (D-590).
// 131: Parse "when this Class becomes level N" (D-591).
// 132: Parse delayed hand returns of the card named by a dies trigger (D-592).
// 133: Parse numbered toxic keywords and a quoted "can't block" token ability (D-593).
export const PARSER_VERSION = 135;

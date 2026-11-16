/**
 * Bump on every change to what the parser reads or to how a card's support is decided: cached
 * support reports (`SupportReport.parserVersion`, IndexedDB) and `golden.expected.json` are
 * recomputed when it changes. Rule ids are part of that contract: renaming one needs a bump,
 * because ids appear in reports.
 *
 * What each version added: `git log -p -- packages/cards/src/version.ts`, `docs/DECISIONS.md`
 * (one entry per slice) and `docs/MECHANICS.md`.
 */
// 106: Read one-card look-and-take effects with the remaining cards ordered on top or bottom.
// 107: Bind "it phases out" to the earlier targeted creature.
// 108: Read repeated colored spell subjects in cost reductions.
// 109: Read a first-spell trigger during each opponent's turn.
// 110: Choose a creature type as a spell resolves and use it in the following instructions.
// 111: Read "you attack with one or more" through the existing attack-batch trigger.
// 112: Read temporary grants of a quoted triggered ability and return the card a creature became to the battlefield.
// 113: Read the tapped Fish form of Gift and condition target slots on whether Gift was promised.
// 114: Read optional resolving choices of permanents and graveyard cards (D-540).
// 115: Read a target mana-value limit from its controller's graveyard count (D-541).
// 116: Read "They block this turn if able" for the preceding plural creature group (D-542).
// 117: Read player-directed control of target groups and nonattacking creature filters (D-543).
// 118: Read "with one or more targets" and "draw that many" for a cast trigger (D-544).
export const PARSER_VERSION = 118;

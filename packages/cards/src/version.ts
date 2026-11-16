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
export const PARSER_VERSION = 109;

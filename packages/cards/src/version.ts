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
export const PARSER_VERSION = 106;

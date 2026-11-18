/**
 * Bump on every change to what the parser reads or to how a card's support is decided: cached
 * support reports (`SupportReport.parserVersion`, IndexedDB) and `golden.expected.json` are
 * recomputed when it changes. Rule ids are part of that contract: renaming one needs a bump,
 * because ids appear in reports.
 *
 * What each version added: `git log -p -- packages/cards/src/version.ts` and `docs/MECHANICS.md`.
 * Keep this file to the one constant: a comment per version made every parser pull request conflict.
 */
// 152: Silverquill Influence deck (issue 89): the sentences of 29 of its cards (ward, goad, attack-aimed triggers, Aura returns, look and reveal pieces, an Aura attached to a token).
export const PARSER_VERSION = 152;

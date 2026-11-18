/**
 * Bump whenever engine behavior changes. Every game state records it (`GameState.engineVersion`).
 * What each version changed: `git log -p -- packages/engine/src/version.ts`. Keep this file to the one
 * constant: a comment per version made every engine pull request conflict with every other.
 */
// 140: Silverquill Influence deck (issue 89): granted ward and annihilator, goad as an effect, attack-aimed triggers and conditions, protection from the chosen color, hexproof loss, the last-known Auras of a permanent that left, and the cast, reveal, look and attach pieces of its Aura cards.
export const ENGINE_VERSION = 141;

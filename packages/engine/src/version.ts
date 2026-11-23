/**
 * Bump whenever engine behavior changes. Every game state records it (`GameState.engineVersion`).
 * What each version changed: `git log -p -- packages/engine/src/version.ts`. Keep this file to the one
 * constant: a comment per version made every engine pull request conflict with every other.
 */
export const ENGINE_VERSION = 185;

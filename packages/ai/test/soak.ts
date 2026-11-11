// How many games a soak test plays (D-126, applying D-013 and SPEC A13: 20 games on every run and
// pull request, 500 nightly and before each milestone report). `SOAK_GAMES` overrides the default:
// `pnpm test:soak` sets 100, the nightly workflow 500. The M1 done-when test (`games-100.test.ts`)
// keeps its fixed 100 games.

import { expect } from 'vitest';

const DEFAULT_GAMES = 20;

export function soakGames(): number {
  const raw = process.env.SOAK_GAMES;
  if (raw === undefined || raw === '') return DEFAULT_GAMES;
  const games = Number(raw);
  if (!Number.isInteger(games) || games < 1) {
    throw new Error(`SOAK_GAMES must be a positive whole number, got "${raw}"`);
  }
  return games;
}

/**
 * The timeout of a soak test, given the timeout it needed for 100 games: never below that (a loaded
 * machine still has the old margin), and scaled up for longer runs.
 */
export function soakTimeout(msFor100Games: number): number {
  return Math.max(msFor100Games, Math.ceil((msFor100Games * soakGames()) / 100));
}

/** True when the soak plays enough games for every path of its deck style to occur. */
export const FULL_SOAK = soakGames() >= 100;

/**
 * "This path occurred in the games." Checked from 100 games up (`pnpm test:soak`, the nightly run),
 * where every path of a deck style shows up; at the default 20 a rare path may not, and the
 * per-game checks (no fault, exact replay, consistent state) are what the run is for.
 */
export function expectPath(count: number, label?: string): void {
  if (FULL_SOAK) expect(count, label).toBeGreaterThan(0);
}

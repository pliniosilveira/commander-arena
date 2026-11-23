/**
 * The last "Number of opponents" choice of the start screen, remembered in localStorage like the
 * other settings (which may be unavailable: the choice then holds for the visit only).
 */
export const OPPONENT_COUNTS = [1, 2, 3] as const;
export type OpponentCount = (typeof OPPONENT_COUNTS)[number];

const KEY = 'commander-arena.opponent-count';

export function readStoredOpponentCount(): OpponentCount | null {
  try {
    const value = Number(window.localStorage.getItem(KEY));
    return OPPONENT_COUNTS.find((n) => n === value) ?? null;
  } catch {
    return null;
  }
}

export function storeOpponentCount(count: OpponentCount): void {
  try {
    window.localStorage.setItem(KEY, String(count));
  } catch {
    // Private windows and blocked storage: the choice still applies for this visit.
  }
}

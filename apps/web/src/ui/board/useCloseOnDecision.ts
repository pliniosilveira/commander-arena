import type { GameView } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';

/**
 * Closes the zone list when the game asks something other than priority. A card clicked in the
 * graveyard list (a flashback cast) starts a transaction (kicker question, targets, payment) whose
 * overlays and clickable board sit behind the list, so the list must go.
 *
 * Issue 23: also when a question other than priority is answered. A list opened by hand while a spell
 * asked for its targets used to stay over the board after the answer, dimming it until the player
 * pressed Esc.
 */
/** True when the list must close as the pending decision changes from `before` to `now` (null is nothing pending). */
export function closesList(before: string | null, now: string | null): boolean {
  if (now === before) return false;
  if (now !== null && now !== 'priority') return true;
  return before !== null && before !== 'priority';
}

export function useCloseOnDecision(view: GameView | null, close: () => void): void {
  const kind = view?.pending?.kind ?? null;
  const last = useRef(kind);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (closesList(last.current, kind)) closeRef.current();
    last.current = kind;
  }, [kind]);
}

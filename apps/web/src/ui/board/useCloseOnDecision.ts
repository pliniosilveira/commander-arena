import type { GameView } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';

/**
 * Closes the zone list when the game asks something other than priority. A card clicked in the
 * graveyard list (a flashback cast) starts a transaction (kicker question, targets, payment) whose
 * overlays and clickable board sit behind the list, so the list must go.
 */
export function useCloseOnDecision(view: GameView | null, close: () => void): void {
  const kind = view?.pending?.kind ?? null;
  const last = useRef(kind);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (kind !== null && kind !== 'priority' && kind !== last.current) closeRef.current();
    last.current = kind;
  }, [kind]);
}

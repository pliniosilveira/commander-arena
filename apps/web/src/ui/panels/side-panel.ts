/**
 * Which side of the screen the column with the stack and the controls sits on (issue 47; issue 43a
 * had one column with everything). The column with the highlighted card and the log takes the other
 * side. Right by default; remembered in localStorage like the text size (which may be unavailable).
 * CSS places the columns from `data-side-panel` on the page root (`styles.css`). The storage key and
 * the values are the ones of the one-column layout: a remembered Right or Left still means the side
 * the stack is on.
 */
import { useSyncExternalStore } from 'react';

export type SidePanelSide = 'left' | 'right';

const KEY = 'commander-arena.side-panel';
const DEFAULT: SidePanelSide = 'right';

export function readStoredSidePanel(): SidePanelSide | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'left' || value === 'right' ? value : null;
  } catch {
    return null;
  }
}

let current: SidePanelSide = DEFAULT;
const listeners = new Set<() => void>();

/** Reads the remembered side and applies it to the page. Call once when the app starts. */
export function applyStoredSidePanel(): void {
  setSidePanel(readStoredSidePanel() ?? DEFAULT, false);
}

export function currentSidePanel(): SidePanelSide {
  return current;
}

export function setSidePanel(side: SidePanelSide, remember: boolean): void {
  current = side;
  if (typeof document !== 'undefined') document.documentElement.dataset.sidePanel = side;
  if (remember) {
    try {
      window.localStorage.setItem(KEY, side);
    } catch {
      // Private windows and blocked storage: the side still applies for this visit.
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidePanel(): SidePanelSide {
  return useSyncExternalStore(subscribe, currentSidePanel, () => DEFAULT);
}

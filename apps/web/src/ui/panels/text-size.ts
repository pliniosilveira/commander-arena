/**
 * Text size (issue 43): Normal or Large, remembered in localStorage like the theme (which may be
 * unavailable). CSS scales every in-game font through `--text-scale` (`styles.css`); the tile and
 * hand card sizes are drawn from numbers, so the board reads the same factor here. Large is the
 * default: the playtests found the board text hard to read.
 */
import { useSyncExternalStore } from 'react';

export type TextSize = 'normal' | 'large';

export const TEXT_SCALES: Readonly<Record<TextSize, number>> = { normal: 1, large: 1.2 };

const KEY = 'commander-arena.text-size';
const DEFAULT: TextSize = 'large';

export function readStoredTextSize(): TextSize | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'normal' || value === 'large' ? value : null;
  } catch {
    return null;
  }
}

let current: TextSize = DEFAULT;
const listeners = new Set<() => void>();

/** Reads the remembered size and applies it to the page. Call once when the app starts. */
export function applyStoredTextSize(): void {
  setTextSize(readStoredTextSize() ?? DEFAULT, false);
}

export function currentTextSize(): TextSize {
  return current;
}

export function setTextSize(size: TextSize, remember: boolean): void {
  current = size;
  if (typeof document !== 'undefined') document.documentElement.dataset.textSize = size;
  if (remember) {
    try {
      window.localStorage.setItem(KEY, size);
    } catch {
      // Private windows and blocked storage: the size still applies for this visit.
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, currentTextSize, () => DEFAULT);
}

/** The factor the board multiplies tile and hand card sizes by. */
export function useTextScale(): number {
  return TEXT_SCALES[useTextSize()];
}

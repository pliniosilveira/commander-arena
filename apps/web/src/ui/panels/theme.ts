/** Light and dark theme: the choice is remembered in localStorage, which may be unavailable. */

export type Theme = 'dark' | 'light';

const KEY = 'commander-arena.theme';

export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** The theme currently applied to the page (dark is the default in `styles.css`). */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme, remember: boolean): void {
  document.documentElement.dataset.theme = theme;
  if (!remember) return;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // Private windows and blocked storage: the theme still applies for this visit.
  }
}

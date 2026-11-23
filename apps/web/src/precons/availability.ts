/**
 * Which built-in precons the player switched off on the decks page. A switched-off precon is not
 * offered in the deck pickers and is never chosen by a Random button. Kept in this browser only;
 * localStorage may be unavailable, in which case every precon stays on.
 */
const KEY = 'commander-arena.precons-off';

export function loadDisabledPrecons(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveDisabledPrecons(ids: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // The choice then only lasts until the page is closed.
  }
}

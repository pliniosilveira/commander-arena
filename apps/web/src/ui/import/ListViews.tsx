/** "Your decks": a presentational list; the screen loads and refreshes it. */
import type { SavedDeck } from '../../import/types';

export function SavedDecksView({
  decks,
  loading,
  onOpen,
  onRemove,
}: {
  decks: readonly SavedDeck[] | null;
  loading: boolean;
  onOpen: (deck: SavedDeck) => void;
  onRemove: (deck: SavedDeck) => void;
}) {
  return (
    <section className="imp-section" aria-labelledby="imp-decks-h">
      <h2 id="imp-decks-h">Your decks</h2>
      <p className="scr-help">
        Saved in this browser only. A saved deck keeps your pasted list; opening it imports it
        again, so it needs a connection to Scryfall.
      </p>
      {decks === null ? (
        <p aria-live="polite">
          {loading ? 'Loading your decks…' : 'Your decks could not be loaded.'}
        </p>
      ) : decks.length === 0 ? (
        <p>No saved decks yet. Paste a list on the Import tab and choose "Save deck".</p>
      ) : (
        <ul className="imp-list imp-saved">
          {decks.map((deck) => (
            <li key={deck.id}>
              <span>
                <strong>{deck.name}</strong>{' '}
                <span className="scr-help">saved {deck.savedAt.slice(0, 10)}</span>
              </span>
              <span className="imp-row-actions">
                <button type="button" className="scr-btn" onClick={() => onOpen(deck)}>
                  Open<span className="imp-sr"> {deck.name}</span>
                </button>
                <button type="button" className="scr-btn" onClick={() => onRemove(deck)}>
                  Delete<span className="imp-sr"> {deck.name}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

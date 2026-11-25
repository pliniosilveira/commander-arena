/** "My decks": a presentational list; the screen loads and refreshes it. */
import type { SavedDeck } from '../../import/types';
import { type DeckChoice, savedDeckChoiceId } from '../../precons';

export function SavedDecksView({
  decks,
  choices = [],
  loading,
  onOpen,
  onView,
  onRemove,
}: {
  decks: readonly SavedDeck[] | null;
  /** The deck choices, for the commander and its art; a deck without one shows its name only. */
  choices?: readonly DeckChoice[];
  loading: boolean;
  onOpen: (deck: SavedDeck) => void;
  onView: (deck: SavedDeck) => void;
  onRemove: (deck: SavedDeck) => void;
}) {
  return (
    <section className="imp-section" aria-labelledby="imp-decks-h">
      <h2 id="imp-decks-h">My decks</h2>
      <p className="scr-help">
        Saved in this browser only. A saved deck keeps your pasted list; editing it imports it
        again, so it needs a connection to Scryfall.
      </p>
      {decks === null ? (
        <p aria-live="polite">
          {loading ? 'Loading your decks…' : 'My decks could not be loaded.'}
        </p>
      ) : decks.length === 0 ? (
        <p>
          No saved decks yet. Paste a list on the Import tab and press Import: it saves the deck.
        </p>
      ) : (
        <ul className="imp-list imp-saved">
          {[...decks]
            .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
            .map((deck) => {
              const choice = choices.find((c) => c.id === savedDeckChoiceId(deck.id));
              return (
                <li key={deck.id}>
                  {choice?.commanderImage !== undefined && (
                    <img
                      className="scr-deck-art"
                      src={choice.commanderImage}
                      alt=""
                      loading="lazy"
                      width={106}
                      height={77}
                    />
                  )}
                  <span className="scr-deck-text imp-precon-text">
                    <span className="scr-deck-name">{deck.name}</span>
                    {choice !== undefined && choice.commander !== '' && (
                      <span className="scr-deck-commander">Commander: {choice.commander}</span>
                    )}
                    <span className="scr-deck-set">Saved {deck.savedAt.slice(0, 10)}</span>
                  </span>
                  <span className="imp-row-actions">
                    <button type="button" className="scr-btn" onClick={() => onView(deck)}>
                      View<span className="imp-sr"> {deck.name}</span>
                    </button>
                    <button type="button" className="scr-btn" onClick={() => onOpen(deck)}>
                      Edit<span className="imp-sr"> {deck.name}</span>
                    </button>
                    <button type="button" className="scr-btn" onClick={() => onRemove(deck)}>
                      Delete<span className="imp-sr"> {deck.name}</span>
                    </button>
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}

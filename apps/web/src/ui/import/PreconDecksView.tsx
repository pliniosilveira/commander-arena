/**
 * "Precons" on the decks page (issue 93, D-215): the decks that come with the app, shown beside the
 * decks you saved. Each can be opened in the editor; saving there stores your version in this
 * browser only (the built-in list is never changed), and "Reset to default" brings the shipped
 * list back. An edited precon is judged like any deck: a card the engine cannot run makes it
 * unplayable until it is replaced or the precon is reset.
 */
import { useState } from 'react';
import type { DeckChoice } from '../../precons';

export function PreconDecksView({
  precons,
  onToggle,
  onView,
  onReset,
}: {
  precons: readonly DeckChoice[];
  /** Switches a precon on or off for the deck pickers and the Random buttons. */
  onToggle: (id: string, enabled: boolean) => void;
  onView: (precon: DeckChoice) => void;
  onReset: (precon: DeckChoice) => void;
}) {
  // The precon whose reset waits for a second click: the edits are lost for good.
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <section className="imp-section" aria-labelledby="imp-precons-h">
      <h2 id="imp-precons-h">Built-in decks</h2>
      <p className="scr-help">
        The precons that come with the app. Switch one off to hide it from the deck lists and keep
        it out of the Random buttons; the choice is kept in this browser only.
      </p>
      {precons.length === 0 ? (
        <p>No precon is installed yet.</p>
      ) : (
        <ul className="imp-list imp-saved" data-testid="precon-decks">
          {[...precons]
            .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
            .map((deck) => (
              <li key={deck.id} data-precon={deck.id}>
                {deck.commanderImage !== undefined && (
                  <img
                    className="scr-deck-art"
                    src={deck.commanderImage}
                    alt=""
                    loading="lazy"
                    width={106}
                    height={77}
                  />
                )}
                <span className="scr-deck-text imp-precon-text">
                  <span className="scr-deck-name">
                    {deck.name}
                    {deck.edited && (
                      <span className="imp-tag" data-testid="precon-tag" data-edited>
                        Edited by you
                      </span>
                    )}
                  </span>
                  {deck.commander !== '' && (
                    <span className="scr-deck-commander">Commander: {deck.commander}</span>
                  )}
                  {(deck.set !== undefined || deck.year !== undefined) && (
                    <span className="scr-deck-set">
                      {[deck.set, deck.year].filter((part) => part !== undefined).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="imp-row-actions">
                  <label className="scr-help">
                    <input
                      type="checkbox"
                      data-testid="precon-toggle"
                      checked={deck.enabled !== false}
                      onChange={(event) => onToggle(deck.id, event.target.checked)}
                    />{' '}
                    Available<span className="imp-sr"> {deck.name}</span>
                  </label>
                  {confirming === deck.id ? (
                    <>
                      <span className="scr-help">Discard your edits?</span>
                      <button
                        type="button"
                        className="scr-btn"
                        onClick={() => {
                          setConfirming(null);
                          onReset(deck);
                        }}
                      >
                        Yes, reset<span className="imp-sr"> {deck.name}</span>
                      </button>
                      <button type="button" className="scr-btn" onClick={() => setConfirming(null)}>
                        Keep my edits<span className="imp-sr"> of {deck.name}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="scr-btn" onClick={() => onView(deck)}>
                        View<span className="imp-sr"> {deck.name}</span>
                      </button>
                      {deck.edited && (
                        <button
                          type="button"
                          className="scr-btn"
                          onClick={() => setConfirming(deck.id)}
                        >
                          Reset to default<span className="imp-sr"> {deck.name}</span>
                        </button>
                      )}
                    </>
                  )}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

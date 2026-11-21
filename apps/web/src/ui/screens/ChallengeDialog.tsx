/**
 * The second step of the Challenges flow: "Choose your challenge". Only a title, a subtitle, the
 * list of opponents, Cancel and Back: no search, color filter, tabs or Random buttons. Tapping an
 * opponent starts the game against it.
 */
import { useEffect, useId, useRef } from 'react';
import type { DeckChoice } from '../../precons';
import { ManaCost } from '../mana';

export function ChallengeDialog({
  challenges,
  error,
  busy,
  onChoose,
  onBack,
  onCancel,
}: {
  challenges: readonly DeckChoice[];
  /** Why the last choice was refused, if it was. */
  error: string | null;
  /** True while the game is being prepared: the list is disabled. */
  busy: boolean;
  onChoose: (id: string) => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  // Focus moves into the dialog when it opens and back to the opener when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => opener?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a click on the backdrop closes the dialog; Esc is the keyboard way.
    <div
      className="scr-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={ref}
        className="scr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 id={titleId}>Choose your challenge</h2>
        <p className="scr-help">Select the opponent you want to face.</p>
        <div className="scr-decks-list">
          {challenges.length === 0 && (
            <p className="scr-note" role="note">
              No challenge is installed yet.
            </p>
          )}
          {challenges.map((deck) => (
            <button
              type="button"
              className="scr-deck"
              key={deck.id}
              data-challenge-id={deck.id}
              disabled={busy}
              onClick={() => onChoose(deck.id)}
            >
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
              <span className="scr-deck-text">
                <span className="scr-deck-name">{deck.name}</span>
                <span className="scr-deck-commander">
                  {deck.commander === '' ? 'No commander marked' : `Commander: ${deck.commander}`}
                </span>
              </span>
              {deck.colors !== undefined && (
                <span className="scr-deck-colors">
                  <ManaCost cost={deck.colors.length === 0 ? ['C'] : deck.colors} />
                </span>
              )}
            </button>
          ))}
        </div>
        {error !== null && (
          <p className="scr-error" role="alert">
            {error}
          </p>
        )}
        <div className="scr-modal-nav">
          <div className="scr-modal-group">
            <button type="button" className="scr-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="scr-btn" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

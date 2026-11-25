/** The paste box, deck name, buttons and the explanation of where card data comes from. */
import type { ImportProgress } from '../../import/types';
import { phaseLabel, progressFraction } from './model';

export function ProgressBar({ progress }: { progress: ImportProgress | null }) {
  return (
    <div className="imp-progress" role="status" aria-live="polite">
      {progress !== null && (
        <>
          <label htmlFor="imp-progress-bar">{phaseLabel(progress)}</label>
          <progress
            id="imp-progress-bar"
            max={100}
            value={Math.round(progressFraction(progress) * 100)}
          />
        </>
      )}
    </div>
  );
}

export function InputPanel({
  text,
  name,
  running,
  progress,
  saveMessage,
  onText,
  onName,
  onImport,
  onExample,
  niceArt,
  onNiceArt,
}: {
  text: string;
  name: string;
  running: boolean;
  progress: ImportProgress | null;
  saveMessage: string | null;
  onText: (text: string) => void;
  onName: (name: string) => void;
  onImport: () => void;
  /** Fills in the list of an installed precon; null when none is installed (no button then). */
  onExample: (() => void) | null;
  /** The option "special-frame commander art" (`nice-art.ts`); no checkbox when `onNiceArt` is not given. */
  niceArt?: boolean;
  onNiceArt?: (on: boolean) => void;
}) {
  const empty = text.trim() === '';
  return (
    <section className="imp-section imp-input" aria-labelledby="imp-input-h">
      <h2 id="imp-input-h">Import a deck</h2>
      <p className="imp-note">
        Card data comes from Scryfall, so importing needs an internet connection. Cards you have
        looked up before are kept in this browser. Offline? Go back to the menu and use{' '}
        <strong>Quick start</strong> with the precon, which needs no connection.
      </p>
      <label className="imp-field">
        <span>Deck name</span>
        <input
          className="scr-input"
          value={name}
          maxLength={80}
          placeholder="My Commander deck"
          onChange={(e) => onName(e.target.value)}
        />
      </label>
      <label className="imp-field">
        <span>Decklist (Moxfield, Archidekt, MTG Arena or plain "1 Card Name" lines)</span>
        <textarea
          className="scr-input imp-textarea"
          rows={14}
          value={text}
          spellCheck={false}
          placeholder={'Commander\n1 Name of your commander\n\nDeck\n1 Sol Ring\n36 Forest'}
          onChange={(e) => onText(e.target.value)}
        />
      </label>
      {onNiceArt !== undefined && (
        <label className="imp-check">
          <input
            type="checkbox"
            checked={niceArt === true}
            onChange={(e) => onNiceArt(e.target.checked)}
          />
          <span>
            Use a special-frame art for my commander
            <span className="scr-help">
              {' '}
              (borderless, showcase or extended art) when the list names no printing for it. The
              printing is written on the commander's line, so you can change it on the deck screen.
            </span>
          </span>
        </label>
      )}
      <div className="imp-buttons">
        <button
          type="button"
          className="scr-btn scr-btn-primary"
          disabled={running || empty}
          onClick={onImport}
        >
          {running ? 'Importing…' : 'Import'}
        </button>
        {onExample !== null && (
          <button type="button" className="scr-btn" disabled={running} onClick={onExample}>
            Fill in an example
          </button>
        )}
        <span role="status" aria-live="polite" className="scr-help">
          {saveMessage}
        </span>
      </div>
      <ProgressBar progress={progress} />
    </section>
  );
}

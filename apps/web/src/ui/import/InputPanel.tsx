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

/** The editor is open on a precon the app ships (issue 93, D-215). */
export interface EditingPrecon {
  readonly name: string;
  /** The player already saved a version of it. */
  readonly edited: boolean;
  /** Forget the saved version and show the shipped list again. */
  readonly onReset: () => void;
  /** Leave the precon: the editor becomes a plain import again. */
  readonly onStop: () => void;
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
  onSave,
  precon = null,
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
  onSave: () => void;
  /** Set while a precon is being edited: the name is fixed and Save keeps your version of it. */
  precon?: EditingPrecon | null;
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
      {precon !== null && (
        <div className="imp-editing" data-testid="editing-precon">
          <p className="scr-help">
            <strong>Editing the built-in deck "{precon.name}".</strong>{' '}
            {precon.edited
              ? 'You saved a version of it; that is the one the menu uses.'
              : 'It is still the list that came with the app.'}{' '}
            Change the list, press Import to check it, then save: your version is kept in this
            browser only, and the built-in deck is never changed.
          </p>
          <div className="imp-buttons">
            <button type="button" className="scr-btn" disabled={running} onClick={precon.onReset}>
              Reset to default
            </button>
            <button type="button" className="scr-btn" onClick={precon.onStop}>
              Stop editing this precon
            </button>
          </div>
        </div>
      )}
      <label className="imp-field">
        <span>Deck name</span>
        <input
          className="scr-input"
          readOnly={precon !== null}
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
        <button
          type="button"
          className="scr-btn"
          disabled={running || empty || name.trim() === ''}
          onClick={onSave}
        >
          {precon === null ? 'Save deck' : 'Save my version'}
        </button>
        <span role="status" aria-live="polite" className="scr-help">
          {saveMessage}
        </span>
      </div>
      <ProgressBar progress={progress} />
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { stackLabel } from '../../game/saga';
import { bugReport } from '../../import/bug-report';
import { VERSION_INFO } from '../../version';
import { useApp } from '../store-context';
import { seatName } from './objects';

/**
 * A "Report issue" button at the bottom right that opens a dialog with a text area and a Submit button. Submit opens GitHub's
 * "new issue" page with the description, the build, the game log and the stack already in it (the app has no secret of its own, so
 * the player presses Submit on GitHub; `import/bug-report.ts`). A report too long for a link is copied to the clipboard first.
 * Esc or Cancel closes the dialog.
 */
export function ReportDock() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const log = useApp((s) => s.log);
  const view = useApp((s) => s.snapshot?.view ?? null);
  const stack = useMemo(
    () =>
      view === null
        ? []
        : [...view.stack].reverse().map((o) => ({
            label: stackLabel(o),
            controller: seatName(o.controller, view.viewer),
          })),
    [view],
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const submit = async () => {
    const report = bugReport({
      description: text,
      version: VERSION_INFO,
      turn: view?.turn ?? null,
      log,
      stack,
    });
    // Open the tab first, in the click's own gesture, then fill the clipboard.
    window.open(report.url, '_blank', 'noopener');
    if (!report.fitsInLink) {
      try {
        await navigator.clipboard.writeText(report.body);
        setNote('The full report was copied to your clipboard: paste it into the issue.');
        return;
      } catch {
        setNote('The report is too long for a link and could not be copied.');
        return;
      }
    }
    setNote(null);
    setOpen(false);
    setText('');
  };

  return (
    <>
      <button
        type="button"
        className="log-toggle report-toggle"
        aria-expanded={open}
        aria-controls="report-dialog"
        onClick={() => setOpen(!open)}
      >
        Report issue
      </button>
      {open && (
        <div
          className="log-dialog report-dialog"
          id="report-dialog"
          role="dialog"
          aria-label="Report an issue"
        >
          <label className="report-label" htmlFor="report-text">
            What went wrong?
          </label>
          <textarea
            id="report-text"
            className="report-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe the problem. The game log, the stack and the build are added for you."
          />
          <p className="report-hint">
            This opens a new issue on GitHub; you press Submit there (a GitHub account is needed).
          </p>
          {note !== null && (
            <p className="report-hint" role="status">
              {note}
            </p>
          )}
          <div className="report-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="report-submit" onClick={() => void submit()}>
              Submit
            </button>
          </div>
        </div>
      )}
    </>
  );
}

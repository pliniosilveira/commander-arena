import { useEffect, useState } from 'react';
import { type BugReport, bugReport } from '../../import/bug-report';
import { VERSION_INFO } from '../../version';
import { captureBoard } from './capture-board';

/**
 * A "Report issue" button at the bottom right. Pressing it takes a picture of the board first (the browser's screen capture, so the
 * dialog is not in it), then opens a dialog with a text area and a Submit button. Submit opens GitHub's "new issue" page with the
 * description and the build already in it, and puts the picture on the clipboard to paste into the issue
 * (a link cannot carry an image, and the app has no secret to create the issue itself; `import/bug-report.ts`). A report too long
 * for a link stays in the dialog behind a "Copy full report" button. Esc or Cancel closes the dialog.
 */
export function ReportDock() {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shot, setShot] = useState<Blob | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [longReport, setLongReport] = useState<BugReport | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setLongReport(null);
        setNote(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    setLongReport(null);
    setNote(null);
  };

  const toggle = async () => {
    if (open) return close();
    if (capturing) return;
    // The picture comes first, so the dialog is not in it.
    setCapturing(true);
    setShot(await captureBoard());
    setCapturing(false);
    setOpen(true);
  };

  const copyText = async (body: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(body);
      return true;
    } catch {
      return false;
    }
  };

  const copyShot = async (): Promise<boolean> => {
    if (shot === null) return false;
    try {
      await navigator.clipboard.write([new ClipboardItem({ [shot.type]: shot })]);
      return true;
    } catch {
      return false;
    }
  };

  const submit = async () => {
    const withShot = shot !== null;
    const report = bugReport({
      description: text,
      version: VERSION_INFO,
      screenshot: withShot,
    });
    // Open the tab first, in the click's own gesture, then fill the clipboard.
    window.open(report.url, '_blank', 'noopener');
    const shotCopied = await copyShot();
    const lines: string[] = [];
    if (withShot) {
      lines.push(
        shotCopied
          ? 'The screenshot of the board is on your clipboard: paste it into the issue (Ctrl+V).'
          : 'The screenshot could not be copied.',
      );
    }
    if (!report.fitsInLink) {
      setLongReport(report);
      lines.push(
        'The report is too long for a link: after pasting the screenshot, copy the full report below.',
      );
      setNote(lines.join(' '));
      return;
    }
    if (shotCopied) {
      setNote(lines.join(' '));
      return;
    }
    close();
    setText('');
  };

  const copyLong = async () => {
    if (longReport === null) return;
    setNote(
      (await copyText(longReport.body))
        ? 'The full report was copied: paste it into the issue.'
        : 'The report could not be copied.',
    );
  };

  return (
    <>
      <button
        type="button"
        className="log-toggle report-toggle"
        aria-expanded={open}
        aria-controls="report-dialog"
        disabled={capturing}
        onClick={() => void toggle()}
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
            placeholder="Describe the problem. The build is added for you."
          />
          <p className="report-hint">
            {shot === null
              ? 'No screenshot of the board was taken.'
              : 'A screenshot of the board was taken (without this dialog).'}{' '}
            This opens a new issue on GitHub; you press Submit there (a GitHub account is needed).
          </p>
          {note !== null && (
            <p className="report-hint" role="status">
              {note}
            </p>
          )}
          <div className="report-actions">
            {longReport !== null && (
              <button type="button" onClick={() => void copyLong()}>
                Copy full report
              </button>
            )}
            <button type="button" onClick={close}>
              {note === null ? 'Cancel' : 'Close'}
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

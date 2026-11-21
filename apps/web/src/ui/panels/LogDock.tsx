import { useEffect, useState } from 'react';
import { LogPanel } from './LogPanel';

/**
 * The game log as a button at the bottom left that opens it in a dialog over the board, so it takes
 * no room while nobody reads it. Esc or the button closes it.
 */
export function LogDock() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="log-toggle"
        aria-expanded={open}
        aria-controls="game-log-dialog"
        onClick={() => setOpen(!open)}
      >
        Log
      </button>
      {open && (
        <div className="log-dialog" id="game-log-dialog" role="dialog" aria-label="Game log">
          <LogPanel />
        </div>
      )}
    </>
  );
}

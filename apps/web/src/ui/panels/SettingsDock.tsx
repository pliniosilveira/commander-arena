import { useEffect, useState } from 'react';
import { SettingsPanel } from './SettingsPanel';

/**
 * The settings as a button at the bottom left, next to the log's, that opens them in a dialog over
 * the board, so they take no room while nobody changes one. Esc or the button closes it.
 */
export function SettingsDock() {
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
        className="log-toggle settings-toggle"
        aria-expanded={open}
        aria-controls="game-settings-dialog"
        onClick={() => setOpen(!open)}
      >
        Settings
      </button>
      {open && (
        <div
          className="log-dialog settings-dialog"
          id="game-settings-dialog"
          role="dialog"
          aria-label="Game settings"
        >
          <SettingsPanel startOpen />
        </div>
      )}
    </>
  );
}

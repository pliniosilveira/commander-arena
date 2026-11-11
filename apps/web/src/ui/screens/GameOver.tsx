/** The game-over overlay: result, reason, back to the menu. */
import { useEffect, useRef, useState } from 'react';
import { HUMAN } from '../../game/protocol';
import { useActions, useApp } from '../store-context';
import { lossReason, OUTCOME_TITLE, outcomeFor } from './game-over-model';
import './screens.css';

export function GameOver() {
  const result = useApp((s) => s.snapshot?.view.result ?? null);
  const log = useApp((s) => s.log);
  const { backToMenu } = useActions();
  const [dismissed, setDismissed] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);
  const open = result !== null && !dismissed;

  useEffect(() => {
    if (open) primary.current?.focus();
  }, [open]);

  if (result === null) return null;
  const outcome = outcomeFor(result, HUMAN);
  const reason = lossReason(log, result, HUMAN);

  if (dismissed) {
    return (
      <div className="scr-over-pill" data-outcome={outcome}>
        <span>Game over: {OUTCOME_TITLE[outcome]}</span>
        <button type="button" className="scr-link" onClick={() => setDismissed(false)}>
          Show
        </button>
      </div>
    );
  }

  return (
    <div className="scr-over-backdrop">
      <div
        className="scr-over"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scr-over-title"
        data-outcome={outcome}
      >
        <h2 className="scr-over-title" id="scr-over-title">
          {OUTCOME_TITLE[outcome]}
        </h2>
        {reason !== null && <p className="scr-over-reason">{reason}</p>}
        <div className="scr-over-actions">
          <button
            type="button"
            className="scr-btn scr-btn-primary"
            ref={primary}
            onClick={backToMenu}
          >
            Back to menu
          </button>
          <button type="button" className="scr-btn" onClick={() => setDismissed(true)}>
            Keep looking at the board
          </button>
        </div>
      </div>
    </div>
  );
}

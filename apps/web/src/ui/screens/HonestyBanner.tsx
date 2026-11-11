/** A28: before the first turn, lists every card whose abilities the engine cannot run. */
import { useState } from 'react';
import { HUMAN } from '../../game/protocol';
import { useApp } from '../store-context';
import { honestyLines } from './honesty-model';
import './screens.css';

export function HonestyBanner() {
  const summary = useApp((s) => s.summary);
  const [dismissed, setDismissed] = useState(false);
  const lines = honestyLines(summary, HUMAN);
  if (lines.length === 0 || dismissed) return null;

  return (
    <aside className="scr-honesty" role="alert" aria-label="Unsupported cards">
      <div className="scr-honesty-body">
        <strong>These cards use abilities the engine cannot run:</strong>
        <ul>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>The engine ignores those abilities rather than guess what they do.</p>
      </div>
      <button type="button" className="scr-btn" onClick={() => setDismissed(true)}>
        Dismiss
      </button>
    </aside>
  );
}

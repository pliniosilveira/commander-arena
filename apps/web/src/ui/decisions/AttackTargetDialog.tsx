import type { Action, ChooseOptionDecision, GameView } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { attackTargetPrompt, attackTargetRows } from './attack-target';
import { Dialog } from './Dialog';
import { objectIndex } from './lookup';

/**
 * The modal of "reselect which player or permanent the creature is attacking" (CR 508.7, D-139): one button per player,
 * planeswalker or battle the creature can be made to attack, the current one marked. There is no way out: the effect is
 * resolving, and keeping the current target is one of the answers.
 */
export function AttackTargetDialog({
  d,
  view,
  act,
}: {
  d: ChooseOptionDecision;
  view: GameView;
  act: (action: Action) => void;
}) {
  const index = objectIndex(view);
  const rows = attackTargetRows(d, view, index);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <Dialog label="Reselect attack" className="dec-option dec-attack-target">
      <h2 className="dec-title">{d.sourceName}</h2>
      {d.sourceOracleText === '' ? null : <p className="dec-source-quote">{d.sourceOracleText}</p>}
      <p className="dec-sub">{attackTargetPrompt(d, index)}</p>
      <ul className="dec-attack-target-list">
        {rows.map((row, i) => (
          <li key={row.option}>
            <button
              ref={i === 0 ? first : undefined}
              type="button"
              className={`dec-btn ${row.current ? 'dec-btn-secondary' : 'dec-btn-primary'}`}
              data-option={row.option}
              onClick={() => act({ kind: 'chooseOption', option: row.option })}
            >
              {row.label}
              {row.current ? <span className="dec-attack-now"> attacking now</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

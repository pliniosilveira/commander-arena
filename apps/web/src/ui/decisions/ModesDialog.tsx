import type { ChooseModesDecision } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { BarButtons } from './BarButtons';
import { Dialog } from './Dialog';
import type { Index } from './lookup';
import type { DecisionModel } from './model';
import {
  isPickOne,
  modeKey,
  modesEscalate,
  modesHeading,
  modesSourceLabel,
  NO_LEGAL_ESCALATE_MODE,
  NO_LEGAL_MODE,
  NO_REPEAT_MODE,
  notRepeatedThisTurn,
  toggleMode,
} from './modes-picker';
import type { UiState } from './ui-state';

type Update = (change: (ui: UiState) => UiState) => void;

const NO_OBJECTS: Index = new Map();

/**
 * The modal of the `chooseModes` question (CR 700.2, 601.2b, D-114): "Choose one —" and the like.
 * Each mode is a card with its text. "Choose one" is a group of radio buttons, the others check
 * boxes; a mode that is in no legal set (its targets cannot all be chosen, CR 700.2a) is disabled
 * and says why. Confirm is enabled only for one of the legal sets. Digits 1 to 9 toggle the mode of
 * that number, Enter confirms and Esc cancels the cast or activation (CR 733); a triggered ability
 * has no Cancel (CR 603.3c), so Esc does nothing. The autopilot never answers it.
 */
export function ModesDialog({
  d,
  ui,
  model,
  update,
  index = NO_OBJECTS,
}: {
  d: ChooseModesDecision;
  ui: UiState;
  model: DecisionModel;
  update: Update;
  /** The objects the viewer sees, to read the ability that asks (a mode that may not repeat in a turn). */
  index?: Index;
}) {
  // A cast taken back and started again asks the same question again (same id), and the layer's
  // state may still hold the pick of the first time: the dialog (keyed by the id) starts with none.
  const latest = useRef({ d, update, bar: model.bar });
  latest.current = { d, update, bar: model.bar };
  useEffect(() => latest.current.update((u) => ({ ...u, modes: [] })), []);

  // The keys. The decision layer's own handler stands back while an input has the focus (the mode
  // cards are inputs), so Enter and Esc are answered here for them; digits work anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const onCard = target?.closest('[data-mode-card]') != null;
      const typing =
        target?.isContentEditable === true ||
        (!onCard && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? ''));
      if (typing) return;
      const { d: decision, update: change, bar } = latest.current;
      const index = modeKey(event.key);
      if (index !== null) {
        event.preventDefault();
        change((u) => ({ ...u, modes: toggleMode(decision, u.modes, index) }));
      } else if (onCard && event.key === 'Enter') {
        const confirm = bar.buttons.find((b) => b.variant === 'primary');
        if (confirm === undefined || confirm.disabled) return;
        event.preventDefault();
        confirm.run();
      } else if (onCard && event.key === 'Escape') {
        if (bar.cancel === null) return;
        event.preventDefault();
        bar.cancel.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const one = isPickOne(d);
  // D-145 (CR 702.120a): with escalate a mode that is in no payable set says so.
  // D-151: a mode this permanent chose earlier this turn is out too ("choose one that hasn't been chosen this turn").
  const repeats = !notRepeatedThisTurn(d, index);
  const noMode = !repeats
    ? NO_REPEAT_MODE
    : modesEscalate(d) === null
      ? NO_LEGAL_MODE
      : NO_LEGAL_ESCALATE_MODE;
  const cancel = model.bar.cancel;
  return (
    <Dialog label="Choose modes" className="dec-modes">
      <h2 className="dec-title">{modesSourceLabel(d)}</h2>
      <fieldset className="dec-mode-list">
        <legend className="dec-sub dec-modes-heading" data-modes-heading>
          {modesHeading(d, repeats)}
        </legend>
        {d.modes.map((m) => {
          const on = ui.modes.includes(m.index);
          return (
            <label
              key={m.index}
              className={`dec-mode${on ? ' is-picked' : ''}${m.legal ? '' : ' is-illegal'}`}
              data-mode-card
              data-mode={m.index}
              data-legal={m.legal}
              title={m.legal ? undefined : noMode}
            >
              <input
                className="dec-sr"
                type={one ? 'radio' : 'checkbox'}
                name="modes"
                checked={on}
                disabled={!m.legal}
                onChange={() => update((u) => ({ ...u, modes: toggleMode(d, u.modes, m.index) }))}
              />
              <span className="dec-mode-key" aria-hidden="true">
                {m.index + 1}
              </span>
              <span className="dec-mode-text">{m.text}</span>
              {m.legal ? null : <span className="dec-mode-why">{noMode}</span>}
            </label>
          );
        })}
      </fieldset>
      <p className="dec-sub" data-modes-detail>
        {model.bar.detail}
      </p>
      <BarButtons buttons={cancel === null ? model.bar.buttons : [...model.bar.buttons, cancel]} />
    </Dialog>
  );
}

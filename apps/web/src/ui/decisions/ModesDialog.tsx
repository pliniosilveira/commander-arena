import type { ChooseModesDecision } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { BarButtons } from './BarButtons';
import { Dialog } from './Dialog';
import type { Index } from './lookup';
import type { DecisionModel } from './model';
import {
  addMode,
  isPickOne,
  isRepeatable,
  modeCount,
  modeKey,
  modesEscalate,
  modesHeading,
  modesSourceLabel,
  NO_LEGAL_ESCALATE_MODE,
  NO_LEGAL_MODE,
  NO_REPEAT_MODE,
  notRepeatedThisTurn,
  removeMode,
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
 *
 * When the text lets the same mode be chosen more than once (`d.repeatable`, D-344, CR 700.2d) each mode is a
 * counter instead: "-" and "+" buttons take one choice of it away or add one, up to the number to choose in all;
 * the digit adds one and Shift with the digit takes one away.
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
      // D-344: with the Shift key a digit is the symbol on it, so the mode is read from the key's code: Shift and the digit take one choice away.
      const shifted = event.shiftKey ? /^Digit([1-9])$/.exec(event.code) : null;
      if (shifted !== null && isRepeatable(decision)) {
        event.preventDefault();
        const taken = Number(shifted[1]) - 1;
        change((u) => ({ ...u, modes: removeMode(u.modes, taken) }));
      } else if (index !== null) {
        event.preventDefault();
        change((u) => ({ ...u, modes: toggleMode(decision, u.modes, index) }));
      } else if (onCard && event.key === 'Enter') {
        // A counter's own buttons are pressed with Enter as any button is.
        if (target?.tagName === 'BUTTON') return;
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
  const counted = isRepeatable(d);
  const full = ui.modes.length >= d.max;
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
          if (counted) {
            // D-344 (CR 700.2d): the mode may be chosen more than once; a counter says how many times.
            const times = modeCount(ui.modes, m.index);
            return (
              <div
                key={m.index}
                className={`dec-mode dec-mode-counted${on ? ' is-picked' : ''}${m.legal ? '' : ' is-illegal'}`}
                data-mode-card
                data-mode={m.index}
                data-legal={m.legal}
                data-count={times}
                title={m.legal ? undefined : noMode}
              >
                <span className="dec-mode-key" aria-hidden="true">
                  {m.index + 1}
                </span>
                <span className="dec-mode-text">{m.text}</span>
                {m.legal ? (
                  <span className="dec-mode-counter">
                    <button
                      type="button"
                      className="dec-mode-step"
                      data-mode-minus
                      aria-label={`Choose this mode once less: ${m.text}`}
                      disabled={times === 0}
                      onClick={() => update((u) => ({ ...u, modes: removeMode(u.modes, m.index) }))}
                    >
                      {'\u2212'}
                    </button>
                    <output className="dec-mode-times" data-mode-times aria-live="polite">
                      {times}
                    </output>
                    <button
                      type="button"
                      className="dec-mode-step"
                      data-mode-plus
                      aria-label={`Choose this mode once more: ${m.text}`}
                      disabled={full}
                      onClick={() => update((u) => ({ ...u, modes: addMode(d, u.modes, m.index) }))}
                    >
                      +
                    </button>
                  </span>
                ) : (
                  <span className="dec-mode-why">{noMode}</span>
                )}
              </div>
            );
          }
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

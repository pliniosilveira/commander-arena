import type { Action, ChooseXDecision } from '@commander-arena/engine';
import { useEffect, useRef, useState } from 'react';
import { BarButtons } from './BarButtons';
import { Dialog } from './Dialog';
import type { DecisionModel } from './model';
import type { UiState } from './ui-state';
import {
  clampX,
  initialX,
  isDrawUpTo,
  isMultikicker,
  isPayAnyAmount,
  isReplicate,
  kickCostAt,
  payAmountCostAt,
  typedX,
  xCostAt,
  xKey,
} from './x-picker';

/**
 * The modal of the `chooseX` question (CR 107.3a, 601.2b, D-103): a number field from `min` to the
 * most the player could pay, - and + steppers, "Max" and the confirm button. The field has the focus:
 * digits type the number, Up and Down step it (Page Up and Page Down by 5), Enter confirms and Esc
 * cancels. Cancel rewinds the cast or activation (CR 733). The autopilot never answers it.
 * The same dialog asks how many times a Multikicker cost is paid (CR 702.33c, D-110): the count
 * is the number, starting at 0, with its own words. So does a Replicate cost (CR 702.56a, D-129).
 */
export function XDialog({
  d,
  ui,
  model,
  update,
  act,
}: {
  d: ChooseXDecision;
  ui: UiState;
  model: DecisionModel;
  update: (change: (ui: UiState) => UiState) => void;
  act: (action: Action) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { id, min, max, purpose } = d;
  const kicks = isMultikicker(d);
  const replicates = isReplicate(d);
  // D-151 (CR 118.1): "pay any amount of {R}": a stepper from 0, no Cancel.
  const pays = isPayAnyAmount(d) || isDrawUpTo(d);
  const draws = isDrawUpTo(d);
  // The text in the field: empty while the player is retyping it, else the number.
  const [text, setText] = useState(String(initialX(d)));
  // A cast taken back and started again asks the same question again (same id): start from the
  // initial X, not from the one typed last time.
  useEffect(() => {
    void id;
    update((u) => ({ ...u, x: initialX({ min, max, purpose }) }));
    input.current?.select();
  }, [id, min, max, purpose, update]);
  const set = (value: number) => {
    const x = clampX(d, value);
    setText(String(x));
    update((u) => ({ ...u, x }));
    input.current?.focus();
  };
  const confirm = model.bar.buttons.find((b) => b.variant === 'primary');
  const cost = ui.x === 0 ? '' : xCostAt(d, ui.x);
  return (
    <Dialog
      label={
        kicks
          ? 'Multikicker'
          : replicates
            ? 'Replicate'
            : draws
              ? 'Draw cards'
              : pays
                ? 'Pay any amount'
                : 'Choose X'
      }
      className="dec-small"
    >
      <h2 className="dec-title">{d.sourceName}</h2>
      {d.sourceOracleText === '' ? null : <p className="dec-source-quote">{d.sourceOracleText}</p>}
      <p className="dec-sub" data-x-prompt>
        {model.bar.prompt}
      </p>
      <div className="dec-x-row">
        <button
          type="button"
          className="dec-step"
          aria-label={
            kicks
              ? 'Fewer kicks'
              : replicates
                ? 'Fewer copies'
                : draws
                  ? 'Draw fewer'
                  : pays
                    ? 'Pay less'
                    : 'Less X'
          }
          disabled={ui.x <= d.min}
          onClick={() => set(ui.x - 1)}
        >
          −
        </button>
        <input
          ref={input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="dec-search dec-x-input"
          aria-label={
            kicks
              ? 'Times kicked'
              : replicates
                ? 'Times replicated'
                : draws
                  ? 'Cards drawn'
                  : pays
                    ? 'Times paid'
                    : 'X'
          }
          aria-describedby="dec-x-cost"
          value={text}
          onChange={(e) => {
            const typed = typedX(d, e.target.value);
            setText(typed.shown);
            update((u) => ({ ...u, x: typed.value }));
          }}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            const key = xKey(e.key);
            if (key === null) return;
            e.preventDefault();
            if (key.kind === 'step') set(ui.x + key.by);
            else if (key.kind === 'confirm') confirm?.run();
            else if (key.kind === 'cancel' && !pays) act({ kind: 'cancel' });
          }}
        />
        <button
          type="button"
          className="dec-step"
          aria-label={
            kicks
              ? 'More kicks'
              : replicates
                ? 'More copies'
                : draws
                  ? 'Draw more'
                  : pays
                    ? 'Pay more'
                    : 'More X'
          }
          disabled={ui.x >= d.max}
          onClick={() => set(ui.x + 1)}
        >
          +
        </button>
        <button
          type="button"
          className="dec-btn dec-btn-secondary"
          disabled={ui.x >= d.max}
          onClick={() => set(d.max)}
        >
          Max
        </button>
      </div>
      <p className="dec-sub" id="dec-x-cost" data-x-cost>
        {draws
          ? ui.x === 0
            ? 'Not drawing.'
            : `Drawing ${ui.x} ${ui.x === 1 ? 'card' : 'cards'}.`
          : pays
            ? ui.x === 0
              ? 'Not paying.'
              : `Paying ${payAmountCostAt(d, ui.x)}.`
            : replicates
              ? ui.x === 0
                ? 'Not replicated.'
                : `Replicated ${ui.x === 1 ? 'once' : `${ui.x} times`}: ${kickCostAt(d, ui.x)} added to the cost.`
              : kicks
                ? ui.x === 0
                  ? 'Not kicked.'
                  : `Kicked ${ui.x === 1 ? 'once' : `${ui.x} times`}: ${kickCostAt(d, ui.x)} added to the cost.`
                : cost === ''
                  ? `X = ${ui.x}`
                  : `X = ${ui.x} pays ${cost} of the cost.`}
      </p>
      <BarButtons
        buttons={
          model.bar.cancel === null ? model.bar.buttons : [...model.bar.buttons, model.bar.cancel]
        }
      />
    </Dialog>
  );
}

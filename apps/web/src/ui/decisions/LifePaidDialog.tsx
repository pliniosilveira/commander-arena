import type { Action, ChooseOptionDecision } from '@commander-arena/engine';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import {
  clampLifePaid,
  lifePaidButton,
  lifePaidDetail,
  lifePaidPrompt,
  maxLifePaid,
} from './life-paid';

/**
 * The modal of "As this artifact enters, pay any amount of life" (CR 119.4, 614.12): a number field from 0 to the player's life total with
 * - and + steppers, "Max", and the button that pays. The amount is lost as the permanent enters and it remembers it. There is no way out: the
 * permanent cannot enter before the question is answered, and 0 can always be paid (CR 119.4b).
 */
export function LifePaidDialog({
  d,
  act,
}: {
  d: ChooseOptionDecision;
  act: (action: Action) => void;
}) {
  const max = maxLifePaid(d);
  const [amount, setAmount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const set = (value: number) => {
    setAmount(clampLifePaid(d, value));
    input.current?.focus();
  };
  return (
    <Dialog label="Pay life" className="dec-small">
      <h2 className="dec-title">{d.sourceName}</h2>
      {d.sourceOracleText === '' ? null : <p className="dec-source-quote">{d.sourceOracleText}</p>}
      <p className="dec-sub" data-option-prompt>
        {lifePaidPrompt(d)}
      </p>
      <div className="dec-x-row">
        <button
          type="button"
          className="dec-step"
          aria-label="Pay less"
          disabled={amount <= 0}
          onClick={() => set(amount - 1)}
        >
          −
        </button>
        <input
          ref={input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="dec-search dec-x-input"
          aria-label="Life to pay"
          aria-describedby="dec-life-left"
          value={String(amount)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            setAmount(clampLifePaid(d, digits === '' ? 0 : Number(digits)));
          }}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') set(amount + 1);
            else if (e.key === 'ArrowDown') set(amount - 1);
            else if (e.key === 'PageUp') set(amount + 5);
            else if (e.key === 'PageDown') set(amount - 5);
            else if (e.key === 'Enter') act({ kind: 'chooseOption', option: String(amount) });
            else return;
            e.preventDefault();
          }}
        />
        <button
          type="button"
          className="dec-step"
          aria-label="Pay more"
          disabled={amount >= max}
          onClick={() => set(amount + 1)}
        >
          +
        </button>
        <button
          type="button"
          className="dec-btn dec-btn-secondary"
          disabled={amount >= max}
          onClick={() => set(max)}
        >
          Max
        </button>
      </div>
      <p className="dec-sub" id="dec-life-left" data-life-left>
        {lifePaidDetail(d, amount)}
      </p>
      <div className="dec-buttons" data-count={1}>
        <button
          type="button"
          className="dec-btn dec-btn-primary"
          data-option={String(amount)}
          onClick={() => act({ kind: 'chooseOption', option: String(amount) })}
        >
          {lifePaidButton(amount)}
        </button>
      </div>
    </Dialog>
  );
}

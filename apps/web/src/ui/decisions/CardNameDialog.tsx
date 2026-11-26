import type { Action, ChooseOptionDecision } from '@commander-arena/engine';
import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { optionPrompt } from './option-picker';

/**
 * The modal of "As this creature enters, choose a nonland card name" (CR 201.2, 614.12a, 607.2d): a text box that has the focus, with the nonland cards the game shows
 * (battlefield, graveyards, exile, stack) as suggestions. Any one-line name is an answer, so a card nobody has played yet can be named; nothing hidden is listed. There is no way
 * out: the permanent cannot enter before it has chosen.
 */
export function CardNameDialog({
  d,
  act,
}: {
  d: ChooseOptionDecision;
  act: (action: Action) => void;
}) {
  const listId = useId();
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const chosen = name.trim();
  const submit = () => {
    if (chosen !== '') act({ kind: 'chooseOption', option: chosen });
  };
  return (
    <Dialog label="Choose a card name" className="dec-option dec-card-name">
      <h2 className="dec-title">{d.sourceName}</h2>
      {d.sourceOracleText === '' ? null : <p className="dec-source-quote">{d.sourceOracleText}</p>}
      <p className="dec-sub">{optionPrompt(d)}</p>
      <form
        className="dec-card-name-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={input}
          type="text"
          className="dec-search"
          aria-label="Card name"
          list={listId}
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          placeholder="Type a card name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <datalist id={listId}>
          {d.options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <button
          type="submit"
          className="dec-btn dec-btn-primary"
          data-testid="card-name-submit"
          disabled={chosen === ''}
        >
          Choose
        </button>
      </form>
      {d.options.length === 0 ? null : (
        <ul className="dec-named-list" aria-label="Names in the game">
          {d.options.map((option) => (
            <li key={option}>
              <button
                type="button"
                className="dec-btn dec-btn-secondary"
                data-option={option}
                onClick={() => act({ kind: 'chooseOption', option })}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

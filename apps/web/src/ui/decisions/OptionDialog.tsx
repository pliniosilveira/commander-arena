import type { Action, ChooseOptionDecision, GameView } from '@commander-arena/engine';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { colorName } from '../../game/chosen';
import { ManaSymbol } from '../mana';
import { Dialog } from './Dialog';
import { moveHighlight, optionPrompt, pickerRows, suggestedTypes } from './option-picker';

/**
 * The modal of the `chooseOption` question (CR 614.12a, D-100): "As X enters, choose a creature
 * type / a color". There is no way out: the permanent cannot enter until the player has chosen.
 */
export function OptionDialog({
  d,
  view,
  act,
}: {
  d: ChooseOptionDecision;
  view: GameView;
  act: (action: Action) => void;
}) {
  const choose = (option: string) => act({ kind: 'chooseOption', option });
  const label = d.purpose === 'color' ? 'Choose a color' : 'Choose a creature type';
  return (
    <Dialog label={label} className="dec-option">
      <h2 className="dec-title">{d.sourceName}</h2>
      {d.sourceOracleText === '' ? null : <p className="dec-source-quote">{d.sourceOracleText}</p>}
      <p className="dec-sub">{optionPrompt(d)}</p>
      {d.purpose === 'color' ? (
        <ColorPicker options={d.options} choose={choose} />
      ) : (
        <TypePicker decision={d} view={view} choose={choose} />
      )}
    </Dialog>
  );
}

/** Five buttons, one per color, with the mana symbol and the name. */
function ColorPicker({
  options,
  choose,
}: {
  options: readonly string[];
  choose: (option: string) => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <fieldset className="dec-color-row">
      <legend className="dec-sr">Colors</legend>
      {options.map((color, i) => (
        <button
          key={color}
          ref={i === 0 ? first : undefined}
          type="button"
          className="dec-btn dec-btn-secondary dec-color-btn"
          data-option={color}
          aria-label={colorName(color)}
          onClick={() => choose(color)}
        >
          <ManaSymbol symbol={color} />
          <span>{colorName(color)}</span>
        </button>
      ))}
    </fieldset>
  );
}

/**
 * About 325 creature types: a search box that has the focus (type to filter, Up and Down move the
 * highlight, Enter chooses it) above the list. With nothing typed, a few suggestions come first (the
 * types of the player's own permanents and hand, then their commander's), then every type.
 */
function TypePicker({
  decision,
  view,
  choose,
}: {
  decision: ChooseOptionDecision;
  view: GameView;
  choose: (option: string) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(
    () => suggestedTypes(view, decision.options),
    [view, decision.options],
  );
  const rows = useMemo(
    () => pickerRows(decision.options, suggestions, query),
    [decision.options, suggestions, query],
  );
  const current = rows[active];
  const optionId = (key: string) => `${listId}-${key}`;
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (current === undefined) return;
    const el = document.getElementById(optionId(current.key));
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest' });
  });
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => moveHighlight(a, e.key === 'ArrowDown' ? 1 : -1, rows.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (current !== undefined) choose(current.value);
    } else if (e.key === 'Escape' && query !== '') {
      // Esc clears the search first; it never leaves the question, which has no way out.
      e.preventDefault();
      setQuery('');
      setActive(0);
    }
  };
  let lastGroup: string | null = null;
  return (
    <div className="dec-type-picker">
      <input
        ref={input}
        type="text"
        className="dec-search"
        role="combobox"
        aria-label="Search creature types"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={current === undefined ? undefined : optionId(current.key)}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={`Type to search ${decision.options.length} creature types`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      <div id={listId} className="dec-type-list" role="listbox" aria-label="Creature types">
        {rows.map((row, i) => {
          const heading =
            query.trim() === '' && row.group !== lastGroup
              ? row.group === 'suggested'
                ? 'Suggested'
                : 'All creature types'
              : null;
          lastGroup = row.group;
          return (
            <div key={row.key} role="presentation">
              {heading === null ? null : <p className="dec-type-heading">{heading}</p>}
              <button
                type="button"
                role="option"
                id={optionId(row.key)}
                tabIndex={-1}
                aria-selected={i === active}
                className={`dec-type-row${i === active ? ' is-active' : ''}`}
                data-option={row.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(row.value)}
              >
                {row.value}
              </button>
            </div>
          );
        })}
        {rows.length === 0 ? (
          <p className="dec-sub dec-type-none">No creature type matches.</p>
        ) : null}
      </div>
    </div>
  );
}

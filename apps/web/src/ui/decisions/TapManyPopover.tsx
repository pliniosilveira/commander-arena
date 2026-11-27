import type { Action, ManaColor, ObjectId } from '@commander-arena/engine';
import { useState } from 'react';
import { ManaSymbol } from '../mana';
import { type Index, nameOf } from './lookup';
import { Popover } from './Popover';
import {
  allOf,
  FIVE_COLORS,
  NO_COLORS,
  stepColor,
  type TapManyAsk,
  tapManyAction,
  togglePicked,
  totalOf,
  trimTo,
} from './tap-many';
import type { ChooserAnchor } from './ui-state';

/**
 * The form of a mana ability that taps X permanents ("{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors.", CR 107.3, 106.1b, 605.3b): the
 * player ticks the permanents to tap (all of them to start), then says how many mana of each of the five colors: the colors must be as many as the permanents. The engine accepts any
 * X and mix, so this form builds the action itself; with none ticked and no colors, X is 0 (the ability still costs its life and its source's {T}).
 */
export function TapManyPopover({
  anchor,
  ask,
  life,
  index,
  act,
  close,
}: {
  anchor: ChooserAnchor;
  ask: TapManyAsk;
  /** The life the ability costs, read from the card's text (0 when it says none). */
  life: number;
  index?: Index | undefined;
  act: (action: Action) => void;
  close: () => void;
}) {
  const [picked, setPicked] = useState<readonly ObjectId[]>(ask.candidates);
  const [counts, setCounts] = useState(NO_COLORS);
  const x = picked.length;
  const chosen = totalOf(counts);
  const action = tapManyAction(ask, picked, counts);
  // The same names (several Squirrel tokens) are told apart by their number.
  const names = ask.candidates.map((id) => (index === undefined ? id : nameOf(index, id)));
  const labels = names.map((name, i) =>
    names.filter((n) => n === name).length > 1
      ? `${name} #${names.slice(0, i + 1).filter((n) => n === name).length}`
      : name,
  );
  const colorWord = (c: ManaColor): string =>
    ({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colorless' })[c];
  return (
    <Popover anchor={anchor} className="dec-tap-many">
      <legend className="dec-popover-title">
        Tap which permanents? ({x} of {ask.candidates.length}) Add {x} mana
        {life > 0 ? `, pay ${life} life` : ''}
      </legend>
      <ul className="dec-target-list">
        {ask.candidates.map((id, i) => (
          <li key={id}>
            <button
              type="button"
              className="dec-chip"
              aria-pressed={picked.includes(id)}
              onClick={() => {
                const next = togglePicked(ask.candidates, picked, id);
                setPicked(next);
                setCounts((c) => trimTo(c, next.length));
              }}
            >
              {labels[i]}
            </button>
          </li>
        ))}
      </ul>
      <div className="dec-popover-row">
        <button
          type="button"
          className="dec-chip"
          onClick={() => {
            setPicked(ask.candidates);
            setCounts((c) => trimTo(c, ask.candidates.length));
          }}
        >
          All
        </button>
        <button
          type="button"
          className="dec-chip"
          onClick={() => {
            setPicked([]);
            setCounts(NO_COLORS);
          }}
        >
          None
        </button>
      </div>
      <ul className="dec-tap-many-colors">
        {FIVE_COLORS.map((color) => (
          <li key={color} className="dec-tap-many-color">
            <ManaSymbol symbol={color} />
            <button
              type="button"
              className="dec-chip"
              aria-label={`Fewer ${colorWord(color)} mana`}
              disabled={counts[color] === 0}
              onClick={() => setCounts((c) => stepColor(c, color, -1, x))}
            >
              −
            </button>
            <output aria-label={`${colorWord(color)} mana`}>{counts[color]}</output>
            <button
              type="button"
              className="dec-chip"
              aria-label={`More ${colorWord(color)} mana`}
              disabled={chosen >= x}
              onClick={() => setCounts((c) => stepColor(c, color, 1, x))}
            >
              +
            </button>
            <button
              type="button"
              className="dec-chip"
              aria-label={`All ${x} mana ${colorWord(color)}`}
              disabled={x === 0}
              onClick={() => setCounts(allOf(color, x))}
            >
              All
            </button>
          </li>
        ))}
      </ul>
      <div className="dec-popover-row">
        <button
          type="button"
          className="dec-chip dec-chip-primary"
          disabled={action === null}
          title={action === null ? `Choose ${x - chosen} more mana colors` : undefined}
          onClick={() => {
            if (action !== null) act(action);
          }}
        >
          {action === null ? `Choose ${x - chosen} more` : `Add ${x} mana`}
        </button>
        <button type="button" className="dec-chip" aria-label="Close" onClick={close}>
          ×
        </button>
      </div>
    </Popover>
  );
}

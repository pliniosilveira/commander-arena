/**
 * Dividing combat damage (CR 510.1, 702.19b), docked in the controls column like the other panels of a
 * decision (issue 92): the board stays whole and visible, so the player can read the creatures on it.
 * Every creature in the question is a row with its card face, power and toughness, the damage already
 * marked and the lethal amount; hovering or focusing a row shows the card in the preview panel and
 * lights the creature on the board (`board-highlight.ts`).
 */
import type { DamageChoice, GameView, ObjectView } from '@commander-arena/engine';
import type { CSSProperties } from 'react';
import { CardFace } from '../board/CardFace';
import { useRowFocus } from './board-highlight';
import { amountTo, bump, divisionHints, recipientsOf, remainingFor } from './damage';
import { nameOf, objectIndex, recipientLabel } from './lookup';
import type { UiState } from './ui-state';

type Update = (change: (ui: UiState) => UiState) => void;

const THUMB_WIDTH = 46;

/** "3/4", with "damage 1" when some is marked: what the creature is like now. */
export function creatureLine(o: ObjectView | undefined): string {
  if (o === undefined) return '';
  const pt = o.power !== null && o.toughness !== null ? `${o.power}/${o.toughness}` : '';
  const marked = o.damage > 0 ? `${o.damage} damage marked` : '';
  return [pt, marked].filter((x) => x !== '').join(', ');
}

function Thumb({ object }: { object: ObjectView }) {
  const size = {
    '--hand-w': `${THUMB_WIDTH}px`,
    '--hand-h': `${Math.round(THUMB_WIDTH * 1.4)}px`,
  } as CSSProperties;
  return (
    <div className="dec-card dec-damage-thumb" style={size} aria-hidden="true">
      <CardFace object={object} variant="hand" />
    </div>
  );
}

function DamageSection({
  choice,
  ui,
  view,
  update,
}: {
  choice: DamageChoice;
  ui: UiState;
  view: GameView;
  update: Update;
}) {
  const index = objectIndex(view);
  const left = remainingFor(choice, ui.damage);
  const focus = useRowFocus();
  const source = index.get(choice.source);
  return (
    <fieldset className="dec-damage-choice">
      <legend>
        {nameOf(index, choice.source)}: {choice.power} damage
        {choice.trample ? ', trample' : ''}
        {choice.deathtouch ? ', deathtouch' : ''}
      </legend>
      {source === undefined ? null : (
        <div className="dec-damage-source" {...focus(choice.source)}>
          <Thumb object={source} />
          <span className="dec-damage-name">
            {source.name}
            <small>{creatureLine(source)}</small>
          </span>
        </div>
      )}
      <ul className="dec-damage-rows">
        {recipientsOf(choice).map((row) => {
          const name = recipientLabel(row.to, index, view.viewer);
          const amount = amountTo(ui.damage, choice.source, row.to);
          const card = row.to.kind === 'object' ? index.get(row.to.id) : undefined;
          return (
            <li
              key={row.to.kind === 'player' ? `p${row.to.seat}` : row.to.id}
              className="dec-damage-row"
              data-damage-row={row.to.kind === 'player' ? `seat-${row.to.seat}` : row.to.id}
              {...(row.to.kind === 'object' ? focus(row.to.id) : {})}
            >
              {card === undefined ? null : <Thumb object={card} />}
              <span className="dec-damage-name">
                {name}
                {card === undefined ? null : <small>{creatureLine(card)}</small>}
                <small>{row.lethal === null ? 'tramples over' : `lethal: ${row.lethal}`}</small>
              </span>
              <span className="dec-damage-stepper">
                <button
                  type="button"
                  className="dec-step"
                  aria-label={`Less damage to ${name}`}
                  disabled={amount === 0}
                  onClick={() =>
                    update((u) => ({ ...u, damage: bump(u.damage, choice, row.to, -1) }))
                  }
                >
                  −
                </button>
                <output className="dec-amount" aria-label={`Damage to ${name}`}>
                  {amount}
                </output>
                <button
                  type="button"
                  className="dec-step"
                  aria-label={`More damage to ${name}`}
                  disabled={left === 0}
                  onClick={() =>
                    update((u) => ({ ...u, damage: bump(u.damage, choice, row.to, 1) }))
                  }
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className={`dec-sub dec-left${left === 0 ? '' : ' dec-warn'}`}>
        {left === 0 ? 'All damage assigned.' : `${left} left to assign.`}
      </p>
    </fieldset>
  );
}

export function DamagePanel({
  step,
  choices,
  view,
  ui,
  update,
  error,
}: {
  step: 'firstStrike' | 'regular';
  choices: readonly DamageChoice[];
  view: GameView;
  ui: UiState;
  update: Update;
  error: string | null;
}) {
  const hints = divisionHints(choices, ui.damage);
  return (
    <section className="dec-panel dec-damage-dock" aria-label="Divide combat damage">
      <h3 className="dec-panel-title">Divide combat damage</h3>
      <p className="dec-sub dec-left">
        {step === 'firstStrike' ? 'First-strike damage step. ' : ''}
        Give each blocker at least lethal damage before the next gets any. Hover a creature to read
        it; it lights up on the board.
      </p>
      {choices.map((choice) => (
        <DamageSection key={choice.source} choice={choice} ui={ui} view={view} update={update} />
      ))}
      {hints.map((h) => (
        <p key={h} className="dec-sub dec-left dec-warn">
          {h}
        </p>
      ))}
      {error === null ? null : (
        <p className="dec-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

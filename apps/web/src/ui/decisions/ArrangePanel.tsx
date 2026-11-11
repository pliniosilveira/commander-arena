import type { ArrangeCardsDecision, GameView, ObjectId, ObjectView } from '@commander-arena/engine';
import { type CSSProperties, type DragEvent, useEffect, useState } from 'react';
import { CardFace } from '../board/CardFace';
import {
  type Arrangement,
  arrangeBadge,
  arrangeLabel,
  dropCard,
  flipPile,
  hasOtherPile,
  moveToPile,
  moveWithin,
  type Pile,
  pileHint,
  pileTitle,
} from './arrange';
import { BarButtons } from './BarButtons';
import { Dialog } from './Dialog';
import { useHoverProps } from './hover';
import type { DecisionModel } from './model';
import type { UiState } from './ui-state';

type Control = 'card' | 'earlier' | 'later' | 'flip';

/**
 * The dialog of an arrangeCards decision (scry, surveil, "put them back in any order"): the cards
 * looked at, as card faces, in an ordered row per pile (Top, and Bottom or Graveyard). A card moves
 * between the piles with a click on it, with its buttons, with Up and Down on the focused card, or
 * by dragging it; Left and Right (or the arrow buttons) move it within its pile; Enter confirms.
 * After a move the focus follows the card. The cards come from `view.pendingCards`, which the
 * engine fills for the deciding viewer alone. There is no cancel: the effect is resolving.
 */
export function ArrangePanel({
  decision,
  view,
  ui,
  model,
  update,
}: {
  decision: ArrangeCardsDecision;
  view: GameView;
  ui: UiState;
  model: DecisionModel;
  update: (change: (ui: UiState) => UiState) => void;
}) {
  const hoverProps = useHoverProps();
  const arrangement = ui.arrange;
  const faces = new Map<ObjectId, ObjectView>((view.pendingCards ?? []).map((o) => [o.id, o]));
  const [focus, setFocus] = useState<{ id: ObjectId; control: Control } | null>(null);
  const [dragging, setDragging] = useState<ObjectId | null>(null);
  useEffect(() => {
    if (focus === null) return;
    const root = document.querySelector('.dec-arrange');
    const card = root?.querySelector<HTMLElement>(`[data-arrange-card="${focus.id}"]`);
    // The control that was used is still there unless the card hit an end of its row.
    const control = card?.querySelector<HTMLElement>(
      `[data-control="${focus.control}"]:not(:disabled)`,
    );
    (control ?? card)?.focus();
    setFocus(null);
  }, [focus]);
  // The keyboard lands on the first card when the dialog opens.
  const first = decision.cards[0];
  useEffect(() => {
    if (first !== undefined) {
      document.querySelector<HTMLElement>(`.dec-arrange [data-arrange-card="${first}"]`)?.focus();
    }
  }, [first]);

  const change = (next: (a: Arrangement) => Arrangement, id: ObjectId, control: Control) => {
    update((u) => ({ ...u, arrange: next(u.arrange) }));
    setFocus({ id, control });
  };
  const width = Math.max(
    84,
    Math.min(100, Math.floor((730 - 8 * (decision.cards.length - 1)) / decision.cards.length)),
  );
  const size = {
    '--hand-w': `${width}px`,
    '--hand-h': `${Math.round(width * 1.4)}px`,
  } as CSSProperties;
  const names: readonly Pile[] = hasOtherPile(decision) ? ['top', 'other'] : ['top'];
  const pileOf = (pile: Pile) => (pile === 'top' ? arrangement.top : arrangement.other);

  // Dropping on a card puts the dragged card before it (left half) or after it (right half);
  // dropping on the empty part of a row puts it at the end.
  const accept = (event: DragEvent) => {
    if (dragging !== null) event.preventDefault();
  };
  const dropOn = (event: DragEvent, pile: Pile, at: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragging === null) return;
    const id = dragging;
    setDragging(null);
    change((a) => dropCard(a, decision, id, pile, at), id, 'card');
  };

  return (
    <Dialog label={model.bar.prompt} className="dec-arrange">
      <h2 className="dec-title">{model.bar.prompt}</h2>
      <p className="dec-sub">
        Click a card to send it to the other pile, drag it, or use the arrows. Enter confirms.
      </p>
      {names.map((pile) => {
        const cards = pileOf(pile);
        const title = pileTitle(decision, pile);
        return (
          <section
            key={pile}
            className="dec-arrange-pile"
            data-pile={pile}
            aria-label={`${title} pile`}
          >
            <h3 className="dec-arrange-title">
              {title} <small>{pileHint(decision, pile)}</small>
            </h3>
            <ol
              className="dec-arrange-row"
              style={size}
              onDragOver={accept}
              onDrop={(e) => dropOn(e, pile, cards.length)}
            >
              {cards.length === 0 ? (
                <li className="dec-arrange-empty" style={size} aria-hidden="true">
                  Empty
                </li>
              ) : null}
              {cards.map((id, i) => {
                const face = faces.get(id);
                const name = face?.name ?? 'a card';
                const badge = arrangeBadge(decision, arrangement, id);
                const other: Pile = pile === 'top' ? 'other' : 'top';
                return (
                  <li
                    key={id}
                    className={`dec-arrange-card${dragging === id ? ' is-dragging' : ''}`}
                    data-arrange-card={id}
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: the keyboard moves the focused card
                    tabIndex={0}
                    aria-label={arrangeLabel(decision, arrangement, id, name)}
                    aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onClick={(e) => {
                      // A click on the card sends it to the other pile; its buttons do their own.
                      if (e.target instanceof Element && e.target.closest('button') !== null)
                        return;
                      change((a) => flipPile(a, decision, id), id, 'card');
                    }}
                    onDragOver={accept}
                    onDrop={(e) => {
                      const box = e.currentTarget.getBoundingClientRect();
                      dropOn(e, pile, e.clientX > box.left + box.width / 2 ? i + 1 : i);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : null;
                      if (step !== null) {
                        e.preventDefault();
                        change((a) => moveWithin(a, id, step), id, 'card');
                      } else if (
                        hasOtherPile(decision) &&
                        ((e.key === 'ArrowDown' && pile === 'top') ||
                          (e.key === 'ArrowUp' && pile === 'other'))
                      ) {
                        e.preventDefault();
                        change((a) => moveToPile(a, decision, id, other), id, 'card');
                      }
                    }}
                    {...hoverProps(id)}
                  >
                    <div className="dec-card dec-arrange-face" style={size}>
                      {face === undefined ? null : <CardFace object={face} variant="hand" />}
                      {badge === null ? null : <span className="dec-card-badge">{badge}</span>}
                    </div>
                    <div className="dec-arrange-moves">
                      <button
                        type="button"
                        className="dec-step"
                        data-control="earlier"
                        aria-label={`Move ${name} earlier in the ${title} pile`}
                        disabled={i === 0}
                        onClick={() => change((a) => moveWithin(a, id, -1), id, 'earlier')}
                      >
                        ←
                      </button>
                      {hasOtherPile(decision) ? (
                        <button
                          type="button"
                          className="dec-step dec-arrange-flip"
                          data-control="flip"
                          aria-label={`Move ${name} to the ${pileTitle(decision, other)} pile`}
                          onClick={() =>
                            change((a) => moveToPile(a, decision, id, other), id, 'flip')
                          }
                        >
                          {pile === 'top' ? '↓' : '↑'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="dec-step"
                        data-control="later"
                        aria-label={`Move ${name} later in the ${title} pile`}
                        disabled={i === cards.length - 1}
                        onClick={() => change((a) => moveWithin(a, id, 1), id, 'later')}
                      >
                        →
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      <p className="dec-sub" aria-live="polite">
        {model.bar.detail}
      </p>
      <BarButtons buttons={model.bar.buttons} />
    </Dialog>
  );
}

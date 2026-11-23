/**
 * The Zone Picker (docs/BOARD_COMPONENTS.md): modal list of one zone (graveyard, shared exile,
 * command zone). While a targets or chooseCards question is pending it also carries the question:
 * the card that asks, the prompt, the count and the buttons, so the choice is made in one place.
 * It covers the board only, so the preview panel stays visible and hovering a card works as everywhere else. It handles Esc itself,
 * in the capture phase, and stops the event so the decision layer's Esc (cancel, unpin) does not
 * also fire while the viewer is open.
 */
import type { ObjectView } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { FACE_DOWN_NAME, isHiddenFaceDown } from '../../game/later-text';
import type { LookedCard } from '../../game/looked-cards';
import { possessiveOf } from '../../game/seat-name';
import { useZoneDecision } from '../decisions/zone-decision';
import { useDraggable } from '../dnd/DragProvider';
import { typeLine } from '../format';
import { useInteraction } from '../interaction';
import { ManaCost } from '../mana';
import { useApp, useStaticNotes } from '../store-context';
import { Art } from './art';
import { CardFace } from './CardFace';
import { useHoverPreview } from './hover';
import { findObject } from './resolve';

function ZoneCard({ object }: { object: ObjectView }) {
  const hover = useHoverPreview(object.id);
  const ix = useInteraction();
  // A graveyard card with flashback is carried out of the list onto the board (the list fades).
  const drag = useDraggable(object.id, 'card', object.name);
  const clickable = ix.clickable.has(object.id);
  const selected = ix.selected.has(object.id);
  const badge = ix.badge(object.id);
  const viewer = useApp((st) => st.snapshot?.view.viewer);
  const seatCount = useApp((st) => st.snapshot?.view.seats.length ?? 2);
  // D-151 (CR 113.6b): a card that does something from the graveyard says what, under its picture and in its tooltip.
  const works = useStaticNotes(object.id);
  const fromGraveyard = object.zone === 'graveyard' && works !== undefined ? works : null;
  return (
    <button
      type="button"
      className={`board-zone-card${clickable ? ' is-clickable' : ''}${selected ? ' is-selected' : ''}${
        drag.dragging ? ' is-dragging' : ''
      }`}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      data-object-id={object.id}
      aria-label={isHiddenFaceDown(object) ? `${FACE_DOWN_NAME} (face down)` : object.name}
      aria-pressed={selected}
      onClick={() => {
        if (clickable) ix.onObject(object.id);
      }}
      {...hover}
    >
      <CardFace object={object} variant="full" />
      {badge !== null && <span className="board-ibadge">{badge}</span>}
      {fromGraveyard !== null && (
        <span className="board-zone-marks" data-graveyard-ability title={fromGraveyard.join(' ')}>
          Graveyard ability
        </span>
      )}
      {object.zone === 'exile' && (
        // Exile is shared: whose card it is matters (a suspended card, a foretold one).
        <span className="board-zone-marks" data-exile-owner={object.owner}>
          {object.owner === viewer ? 'Yours' : possessiveOf(object.owner, viewer ?? 0, seatCount)}
        </span>
      )}
    </button>
  );
}

/** A card looked at that cannot be taken: its face only, not clickable. */
function OtherCard({ card }: { card: LookedCard }) {
  const hover = useHoverPreview(card.id);
  return (
    <div className="board-zone-card board-zone-other" data-looked-other={card.id} {...hover}>
      <div className="board-zone-other-face">
        {/* The picture of the card (issue 488); the text below stays as the fallback when it cannot load. */}
        <Art name={card.name} isToken={false} version="normal" className="board-zone-other-image" />
        <p className="board-zone-other-head">
          <b>{card.name}</b>
          <ManaCost cost={card.manaCost} />
        </p>
        <p className="board-dim">{typeLine(card)}</p>
        {card.oracleText === '' ? null : <p className="board-zone-other-text">{card.oracleText}</p>}
      </div>
      <span className="board-zone-marks">Cannot be taken</span>
    </div>
  );
}

export interface ZoneViewerProps {
  readonly title: string;
  readonly objects: readonly ObjectView[];
  /** Cards looked at that cannot be taken (a "look at the top cards" question), after the others. */
  readonly others?: readonly LookedCard[];
  readonly onClose: () => void;
}

/** The side column of a pending question: the card that asks, what to do, the count and the buttons. */
function QuestionSide() {
  const decision = useZoneDecision();
  const view = useApp((st) => st.snapshot?.view ?? null);
  if (decision === null) return null;
  const { bar } = decision;
  const source = view === null ? null : findObject(view, decision.source);
  return (
    <aside className="board-modal-side" aria-label="Question" data-zone-question>
      {source !== null && (
        <div className="board-modal-source" data-zone-source={source.id}>
          <CardFace object={source} variant="full" />
        </div>
      )}
      <p className="board-modal-prompt" aria-live="polite">
        {bar.prompt}
      </p>
      {bar.detail === null ? null : <p className="board-modal-detail">{bar.detail}</p>}
      <div className="board-modal-actions">
        {bar.buttons.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`dec-btn dec-btn-${b.variant}`}
            disabled={b.disabled}
            title={b.hint ?? undefined}
            aria-label={b.ariaLabel}
            onClick={b.run}
          >
            {b.label}
          </button>
        ))}
        {bar.cancel === null ? null : (
          <button type="button" className="dec-btn dec-btn-secondary" onClick={bar.cancel.run}>
            {bar.cancel.label}
          </button>
        )}
      </div>
    </aside>
  );
}

export function ZoneViewer({ title, objects, others = [], onClose }: ZoneViewerProps) {
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const before = document.activeElement;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);

  return (
    <div
      className="board-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="board-modal-panel">
        <header className="board-modal-head">
          <h2>
            {title} <span className="board-modal-count">({objects.length})</span>
          </h2>
          <button
            type="button"
            ref={close}
            className="board-modal-close"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            Close (Esc)
          </button>
        </header>
        <div className="board-modal-main">
          <div className="board-modal-body">
            {objects.length === 0 && others.length === 0 ? (
              <p className="board-modal-empty">Nothing here.</p>
            ) : (
              <>
                {objects.map((o) => (
                  <ZoneCard key={o.id} object={o} />
                ))}
                {others.map((c) => (
                  <OtherCard key={c.id} card={c} />
                ))}
              </>
            )}
          </div>
          <QuestionSide />
        </div>
      </div>
    </div>
  );
}

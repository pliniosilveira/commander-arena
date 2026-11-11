/**
 * Modal list of one zone (graveyard, shared exile, command zone). It covers the board only, so the
 * preview panel stays visible and hovering a card works as everywhere else. It handles Esc itself,
 * in the capture phase, and stops the event so the decision layer's Esc (cancel, unpin) does not
 * also fire while the viewer is open.
 */
import type { ObjectView } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { FACE_DOWN_NAME, isHiddenFaceDown } from '../../game/later-text';
import { useDraggable } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { useApp, useStaticNotes } from '../store-context';
import { CardFace } from './CardFace';
import { useHoverPreview } from './hover';

function ZoneCard({ object }: { object: ObjectView }) {
  const hover = useHoverPreview(object.id);
  const ix = useInteraction();
  // A graveyard card with flashback is carried out of the list onto the board (the list fades).
  const drag = useDraggable(object.id, 'card', object.name);
  const clickable = ix.clickable.has(object.id);
  const selected = ix.selected.has(object.id);
  const badge = ix.badge(object.id);
  const viewer = useApp((st) => st.snapshot?.view.viewer);
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
      <CardFace object={object} variant="hand" />
      {badge !== null && <span className="board-ibadge">{badge}</span>}
      {fromGraveyard !== null && (
        <span className="board-zone-marks" data-graveyard-ability title={fromGraveyard.join(' ')}>
          Graveyard ability
        </span>
      )}
      {object.zone === 'exile' && (
        // Exile is shared: whose card it is matters (a suspended card, a foretold one).
        <span className="board-zone-marks" data-exile-owner={object.owner}>
          {object.owner === viewer ? 'Yours' : "Opponent's"}
        </span>
      )}
    </button>
  );
}

export interface ZoneViewerProps {
  readonly title: string;
  readonly objects: readonly ObjectView[];
  readonly onClose: () => void;
}

export function ZoneViewer({ title, objects, onClose }: ZoneViewerProps) {
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
        <div className="board-modal-body">
          {objects.length === 0 ? (
            <p className="board-modal-empty">Nothing here.</p>
          ) : (
            objects.map((o) => <ZoneCard key={o.id} object={o} />)
          )}
        </div>
      </div>
    </div>
  );
}

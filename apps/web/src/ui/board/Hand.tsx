/** The human's hand, fanned (A19), and the opponent's hand as card backs with a count. */
import type { ObjectView } from '@commander-arena/engine';
import { type CSSProperties, useRef } from 'react';
import { useDraggable } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { useTextScale } from '../panels/text-size';
import { CardFace } from './CardFace';
import { useHoverPreview } from './hover';
import { handScale, handStep } from './layout';
import { useMeasure } from './measure';

// D-240 (issue 137): a quarter bigger than the 108 by 150 of before.
const BASE_W = 135;
const BASE_H = 188;
/**
 * The height of the hand area when the window is short: what shows of a card at rest, the lower part
 * of a card sits below the board edge, as in a held hand; hover lifts it. The area is taller in a
 * taller window (`.board-hand`), and a card shows that much of itself.
 */
const MIN_SHOWN = 108;

function HandCard({
  object,
  index,
  count,
  step,
  scale,
  shown,
}: {
  object: ObjectView;
  index: number;
  count: number;
  step: number;
  /** The text size factor: the cards and the part that shows at rest grow with it. */
  scale: number;
  /** The height of the hand area: the part of a card that shows at rest. */
  shown: number;
}) {
  const cardW = Math.round(BASE_W * scale);
  const cardH = Math.round(BASE_H * scale);
  // The hand area has the height the window leaves it (the board needs the room at 1366x768): a
  // bigger card shows the same top part, with larger text, and sits lower at rest.
  const restDrop = Math.max(0, cardH - shown);
  const hover = useHoverPreview(object.id);
  const ix = useInteraction();
  const drag = useDraggable(object.id, 'card', object.name);
  const clickable = ix.clickable.has(object.id);
  const selected = ix.selected.has(object.id);
  const dimmed = ix.dimOthers && !clickable && !selected;
  const mid = (count - 1) / 2;
  const offset = index - mid;
  const style = {
    '--hand-w': `${cardW}px`,
    // The text on the card grows with the card, not with the setting alone (`handScale`).
    '--text-scale': scale,
    '--hand-h': `${cardH}px`,
    marginLeft: index === 0 ? 0 : `${step - cardW}px`,
    '--fan-rot': `${(offset * 2.2).toFixed(2)}deg`,
    '--fan-drop': `${(restDrop + Math.abs(offset) ** 1.6 * 1.2).toFixed(1)}px`,
    '--z': index + 1,
    // The last card is fully visible; every other one shows only `step` pixels of its left edge.
    '--hand-visible': `${index === count - 1 ? cardW : Math.min(cardW, step)}px`,
  } as CSSProperties;
  const badge = ix.badge(object.id);
  return (
    <button
      type="button"
      className={`board-hand-card${clickable ? ' is-clickable' : ''}${selected ? ' is-selected' : ''}${
        dimmed ? ' is-dimmed' : ''
      }${drag.dragging ? ' is-dragging' : ''}`}
      style={style}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      data-object-id={object.id}
      aria-label={`${object.name}${clickable ? ', playable' : ''}`}
      aria-pressed={selected}
      onClick={() => {
        if (clickable) ix.onObject(object.id);
      }}
      {...hover}
    >
      <CardFace object={object} variant="hand" />
      {badge !== null && <span className="board-ibadge">{badge}</span>}
    </button>
  );
}

export function Hand({
  cards,
  active = false,
}: {
  cards: readonly ObjectView[];
  /** It is the viewer's turn: the hand is part of the highlighted area (D-153). */
  active?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useMeasure(ref);
  const width = size === null ? 800 : size.width;
  const scale = handScale(cards.length, BASE_W, width, useTextScale());
  const step = handStep(cards.length, Math.round(BASE_W * scale), width);
  const shown = size === null ? MIN_SHOWN : size.height;
  return (
    <section
      className={`board-hand ${active ? 'is-active-area' : 'is-idle-area'}`}
      ref={ref}
      aria-label={`Your hand, ${cards.length} cards`}
    >
      <div className="board-hand-fan">
        {cards.length === 0 && <span className="board-hand-empty">Your hand is empty</span>}
        {cards.map((c, i) => (
          <HandCard
            key={c.id}
            object={c}
            index={i}
            count={cards.length}
            step={step}
            scale={scale}
            shown={shown}
          />
        ))}
      </div>
    </section>
  );
}

/** Backs only: the opponent's cards are hidden information (SPEC 4.2). */
export function HandBacks({ count }: { count: number }) {
  const shown = Math.min(count, 10);
  return (
    <span className="board-backs" role="img" aria-label={`${count} cards in hand`}>
      {Array.from({ length: shown }, (_, i) => (
        // The backs are interchangeable; position is all there is to key on.
        // biome-ignore lint/suspicious/noArrayIndexKey: identical decorative elements
        <span key={i} className="board-back" />
      ))}
    </span>
  );
}

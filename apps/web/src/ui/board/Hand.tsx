/** The human's hand, in a straight row that scrolls sideways (A19), and the opponent's hand as card backs with a count. */
import type { ObjectView } from '@commander-arena/engine';
import { type CSSProperties, useEffect, useRef } from 'react';
import { useDraggable } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { useTextScale } from '../panels/text-size';
import { CardFace } from './CardFace';
import { useHoverPreview } from './hover';
import { handStep } from './layout';
import { useMeasure } from './measure';

// D-240 (issue 137) made the card 135 by 188; it is now 10 percent smaller. A card in the hand is the
// whole printed card (488:680): it is big enough to read, so it is not cut to its top as a tile is.
const BASE_W = 122;
const BASE_H = 169;
/** The closest two cards get, as a share of the card width: past it the hand scrolls instead. */
const MIN_STEP_SHARE = 0.55;
/**
 * The height of the hand area when the window is short: what shows of a card at rest, the lower part
 * of a card sits below the board edge, as in a held hand; hover lifts it. The area is taller in a
 * taller window (`.board-hand`), and a card shows that much of itself.
 */
const MIN_SHOWN = 108;
/** Room at each side of the cards, so the lifted first and last card are not cut. */
const FAN_PAD = 20;

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
  const style = {
    '--hand-w': `${cardW}px`,
    // The text on the card grows with the card (the text size setting).
    '--text-scale': scale,
    '--hand-h': `${cardH}px`,
    marginLeft: index === 0 ? 0 : `${step - cardW}px`,
    '--rest-drop': `${restDrop}px`,
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
  cardScale = 1,
}: {
  cards: readonly ObjectView[];
  /** It is the viewer's turn: the hand is part of the highlighted area (D-153). */
  active?: boolean;
  /** A factor on the size of the cards (and their text), on top of the text size setting: the table board draws them smaller. */
  cardScale?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useMeasure(ref);
  const width = size === null ? 800 : size.width;
  // The cards never shrink to fit: a long hand scrolls sideways instead.
  const scale = useTextScale() * cardScale;
  const cardW = Math.round(BASE_W * scale);
  const step = handStep(
    cards.length,
    cardW,
    width - 2 * FAN_PAD,
    6,
    Math.round(cardW * MIN_STEP_SHARE),
  );
  const fanRef = useRef<HTMLDivElement>(null);
  // A mouse wheel scrolls the hand sideways (the scrollbar is hidden and the strip above the cards
  // does not take the pointer).
  useEffect(() => {
    const el = fanRef.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const shown = size === null ? MIN_SHOWN : size.height;
  return (
    <section
      className={`board-hand ${active ? 'is-active-area' : 'is-idle-area'}`}
      ref={ref}
      aria-label={`Your hand, ${cards.length} cards`}
    >
      <div className="board-hand-fan" ref={fanRef}>
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

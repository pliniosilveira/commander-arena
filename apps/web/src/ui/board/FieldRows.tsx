/**
 * The three rows of one battlefield in a single sideways scroller: the rows move together, and the
 * empty room at both ends (half the view, board.css `.board-row-scroll`) lets the outermost card be
 * brought to the middle of the screen, clear of the stack panel on the right.
 */
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { useHiddenCards } from './useHiddenCards';

/** What keeps its own mouse behavior: a press on it never starts a scroll drag. A card that may be
 *  picked up (native drag and drop) is one; any other card, a button too, scrolls the rows. */
const INTERACTIVE = 'a, input, select, textarea, [draggable="true"]';
/** How far (px) the mouse moves before a press becomes a scroll drag, not a click. */
const DRAG_SLOP = 5;
/** The cards of a battlefield; a card attached to another is drawn with its host. */
const CARD = '[data-object-id]:not([data-attached-to])';

export function FieldRows({ children }: { readonly children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  // The arrows show only when a card lies outside the view: the empty room at the ends of the rows
  // always lets them scroll, so the scroll extent says nothing about hidden cards.
  const { hidden, refresh } = useHiddenCards(scroller, CARD);
  // At rest the cards are centred by scrolling to the middle; a change of the track's width (cards
  // arriving or leaving, the window resizing) re-centres.
  useLayoutEffect(() => {
    const el = scroller.current;
    const inner = track.current;
    if (el === null || inner === null) return;
    const centre = () => {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      refresh();
    };
    centre();
    const observer = new ResizeObserver(centre);
    observer.observe(inner);
    observer.observe(el);
    return () => observer.disconnect();
  }, [refresh]);
  // Dragging with the mouse, on the empty room or on a card, scrolls the rows sideways, as a swipe
  // does on a trackpad. A card that can be picked up keeps native drag and drop, a press that
  // does not move is still a click, and a drag that moved never ends in one.
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    let startX = 0;
    let startLeft = 0;
    let pointer: number | null = null;
    let moved = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest(INTERACTIVE) !== null) return;
      pointer = e.pointerId;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      moved = false;
    };
    const onMove = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (!moved) {
        if (Math.abs(dx) < DRAG_SLOP) return;
        moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('board-field-rows-dragging');
      }
      el.scrollLeft = startLeft - dx;
    };
    const onEnd = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      pointer = null;
      el.classList.remove('board-field-rows-dragging');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const onClick = (e: MouseEvent) => {
      if (!moved) return;
      moved = false;
      e.stopPropagation();
      e.preventDefault();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      el.removeEventListener('click', onClick, true);
    };
  }, []);
  const scrollBy = (dx: number) => scroller.current?.scrollBy({ left: dx, behavior: 'smooth' });
  return (
    <div className="board-field-rows-wrap">
      <div className="board-field-rows" ref={scroller}>
        <div className="board-field-track" ref={track}>
          {children}
        </div>
      </div>
      {hidden.left > 0 && (
        <button
          type="button"
          className="board-scroll board-scroll-left"
          aria-label={`Scroll battlefield left, ${hidden.left} hidden`}
          onClick={() => scrollBy(-240)}
        >
          ‹<span className="board-scroll-count">{hidden.left}</span>
        </button>
      )}
      {hidden.right > 0 && (
        <button
          type="button"
          className="board-scroll board-scroll-right"
          aria-label={`Scroll battlefield right, ${hidden.right} hidden`}
          onClick={() => scrollBy(240)}
        >
          ›<span className="board-scroll-count">{hidden.right}</span>
        </button>
      )}
    </div>
  );
}

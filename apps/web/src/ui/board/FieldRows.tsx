/**
 * The three rows of one battlefield in a single sideways scroller: the rows move together, and the
 * empty room at both ends (half the view, board.css `.board-row-scroll`) lets the outermost card be
 * brought to the middle of the screen, clear of the stack panel on the right.
 */
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** What keeps its own mouse behavior: a press on it never starts a scroll drag. */
const INTERACTIVE = 'button, a, input, select, textarea, [draggable="true"], [role="button"]';
/** How far (px) the mouse moves before a press becomes a scroll drag, not a click. */
const DRAG_SLOP = 5;

export function FieldRows({ children }: { readonly children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = scroller.current;
    if (el === null) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);
  // At rest the cards are centred by scrolling to the middle; a change of the track's width (cards
  // arriving or leaving, the window resizing) re-centres.
  useLayoutEffect(() => {
    const el = scroller.current;
    const inner = track.current;
    if (el === null || inner === null) return;
    const centre = () => {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      update();
    };
    centre();
    const observer = new ResizeObserver(centre);
    observer.observe(inner);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);
  // Dragging the empty room between the cards with the mouse scrolls the rows sideways, as a swipe
  // does on a trackpad. Cards, buttons and anything draggable keep their own behavior (native
  // drag and drop, clicks), and a drag that moved never ends in a click.
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
      <div className="board-field-rows" ref={scroller} onScroll={update}>
        <div className="board-field-track" ref={track}>
          {children}
        </div>
      </div>
      {more.left && (
        <button
          type="button"
          className="board-scroll board-scroll-left"
          aria-label="Scroll battlefield left"
          onClick={() => scrollBy(-240)}
        >
          ‹
        </button>
      )}
      {more.right && (
        <button
          type="button"
          className="board-scroll board-scroll-right"
          aria-label="Scroll battlefield right"
          onClick={() => scrollBy(240)}
        >
          ›
        </button>
      )}
    </div>
  );
}

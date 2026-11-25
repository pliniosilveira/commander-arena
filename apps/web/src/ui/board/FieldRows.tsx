/**
 * The three rows of one battlefield in a single sideways scroller: the rows move together, and the
 * empty room at both ends (half the view, board.css `.board-row-scroll`) lets the outermost card be
 * brought to the middle of the screen, clear of the stack panel on the right.
 */
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  // A mouse wheel only reports vertical movement, and the scrollbar is hidden: turn it into a
  // sideways scroll (a trackpad's own sideways movement is left alone). Like the hand does.
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      // Line and page modes (some mice) report small units: scale them to pixels.
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientWidth : 1;
      el.scrollLeft += e.deltaY * unit;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
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

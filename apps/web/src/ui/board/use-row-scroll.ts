/** The sideways scrolling of a battlefield row: whether more lies to the left and right, and the arrows' scroll. */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export function useRowScroll(layoutKey: string) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const updateMore = useCallback(() => {
    const el = scroller.current;
    if (el === null) return;
    // The rows of a field scroll together: the others follow this one (they clamp at their own end).
    const rows = el
      .closest('.board-field-rows')
      ?.querySelectorAll<HTMLElement>('.board-row-scroll');
    for (const other of rows ?? []) {
      if (other !== el && Math.abs(other.scrollLeft - el.scrollLeft) > 1) {
        other.scrollLeft = el.scrollLeft;
      }
    }
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);
  // The layout changes what overflows, so re-read after every layout (`layoutKey` is the trigger).
  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey is the trigger, not an input
  useLayoutEffect(updateMore, [updateMore, layoutKey]);
  const scrollBy = useCallback(
    (dx: number) => scroller.current?.scrollBy({ left: dx, behavior: 'smooth' }),
    [],
  );
  return { scroller, more, updateMore, scrollBy };
}

/**
 * One full-screen SVG overlay drawing an arrow from each stack item to each of its targets. The
 * boxes come from the DOM (`data-object-id` and `data-seat`, a contract with the board); the
 * geometry is `arrows.ts`. Re-measured after every render and on resize, scroll and DOM changes.
 */
import type { ObjectView } from '@commander-arena/engine';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { type Arrow, arrowBetween, type Box, clipBox, facingEdge, loopArrow } from './arrows';

interface Placed {
  readonly key: string;
  readonly arrow: Arrow;
}

const cssEscape = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');

/** The nearest ancestor that scrolls on the vertical axis (the stack list, the log, a row). */
function scroller(el: Element): Element | null {
  for (let p = el.parentElement; p !== null; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return p;
  }
  return null;
}

/**
 * The box of the first element for a selector that is actually on screen, cut to what its scrolling
 * parent shows: a stack item scrolled out of the list keeps its arrow, drawn from the list's edge.
 */
function visible(selector: string): Box | null {
  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const parent = scroller(el);
    return parent === null ? rect : clipBox(rect, parent.getBoundingClientRect());
  }
  return null;
}

function measure(items: readonly ObjectView[]): Placed[] {
  const placed: Placed[] = [];
  for (const item of items) {
    const from = visible(`[data-object-id="${cssEscape(item.id)}"]`);
    if (from === null) continue;
    item.targets.forEach((target, i) => {
      const selector =
        target.kind === 'object'
          ? `[data-object-id="${cssEscape(target.id)}"]`
          : `[data-seat="${target.seat}"]`;
      const to = visible(selector);
      if (to === null) return;
      // Alternate the bow so two arrows from one item do not overlap.
      const start = facingEdge(from, to);
      const arrow =
        arrowBetween(start, to, { bend: i % 2 === 0 ? 0.15 : -0.15 }) ?? loopArrow(from, to);
      if (arrow !== null) placed.push({ key: `${item.id}-${i}`, arrow });
    });
  }
  return placed;
}

const signature = (placed: readonly Placed[]): string =>
  placed.map((p) => `${p.key}:${p.arrow.path}:${p.arrow.headPoints}`).join('|');

export function StackArrows({ items }: { items: readonly ObjectView[] }) {
  const [placed, setPlaced] = useState<readonly Placed[]>([]);
  const last = useRef('');
  const frame = useRef(0);

  const update = useCallback(() => {
    const next = measure(items);
    const sig = signature(next);
    if (sig === last.current) return;
    last.current = sig;
    setPlaced(next);
  }, [items]);

  // After every render: the board may have moved even if the stack did not change.
  useLayoutEffect(() => {
    update();
  });

  useLayoutEffect(() => {
    if (items.every((item) => item.targets.length === 0)) return;
    const schedule = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(update);
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    const root = document.querySelector('.game') ?? document.body;
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true, attributes: true });
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [items, update]);

  return (
    <svg className="pnl-arrows" aria-hidden="true" focusable="false">
      {placed.map(({ key, arrow }) => (
        <g key={key} className="pnl-arrow">
          <path d={arrow.path} className="pnl-arrow-shaft" />
          <polygon points={arrow.headPoints} className="pnl-arrow-head" />
        </g>
      ))}
    </svg>
  );
}
